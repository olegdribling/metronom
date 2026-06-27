# MAINTENANCE — разовые ручные операции на прод-БД

Это не versioned-миграция и не выполняется автоматически. `migrate.js` (`CREATE TABLE IF NOT EXISTS`) не трогает уже существующие таблицы — все ALTER'ы ниже нужно прогнать на проде руками один раз, после деплоя кода из `migrate.js`/`db/index.js`, который добавил FK/charset/`DATETIME(3)` для новых установок.

Каждый шаг с ALTER требует подтверждения перед запуском — это изменение продовой схемы/данных.

## 1. Диагностика (read-only, безопасно)

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  mysql -h 127.0.0.1 -u u673267555_metro -p u673267555_Metronom -e "
    SHOW TABLE STATUS WHERE Name IN (\"users\",\"refresh_tokens\",\"password_reset_tokens\",\"songs\");
  "
'
```

Проверить колонку `Collation` — если у всех 4 таблиц уже `utf8mb4_*`, шаг 3 (конвертация charset) не нужен.

Проверка "сирот" перед добавлением FK:

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  mysql -h 127.0.0.1 -u u673267555_metro -p u673267555_Metronom -e "
    SELECT \"refresh_tokens\" AS tbl, COUNT(*) AS orphans FROM refresh_tokens rt LEFT JOIN users u ON u.id=rt.user_id WHERE u.id IS NULL
    UNION ALL
    SELECT \"password_reset_tokens\", COUNT(*) FROM password_reset_tokens p LEFT JOIN users u ON u.id=p.user_id WHERE u.id IS NULL
    UNION ALL
    SELECT \"songs\", COUNT(*) FROM songs s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL;
  "
'
```

Если `orphans > 0` по какой-то таблице — **не удалять автоматически**. Сначала посмотреть, что именно за строки (`SELECT * FROM <table> WHERE user_id NOT IN (SELECT id FROM users)`), и решить вручную (удалить или восстановить недостающего пользователя), прежде чем переходить к шагу 4 — иначе `ADD FOREIGN KEY` упадёт с ошибкой.

## 2. Бэкап (обязателен перед любым ALTER ниже)

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  mysqldump -h 127.0.0.1 -u u673267555_metro -p u673267555_Metronom > ~/backup_before_db_hardening_$(date +%Y%m%d).sql
'
```

## 3. Конвертация charset (только если шаг 1 показал не-utf8mb4)

```sql
ALTER TABLE users                 CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE refresh_tokens        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE password_reset_tokens CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE songs                 CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`songs.data` — колонка `JSON`, у неё нет собственного charset (хранится в бинарном формате), но конвертация таблицы всё равно нужна для table-level default charset.

## 4. Точность `updated_at` (нужно сделать до деплоя optimistic lock на `PUT /songs`)

```sql
ALTER TABLE songs MODIFY updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
```

## 5. Foreign keys с ON DELETE CASCADE (только после того, как шаг 1 подтвердил отсутствие сирот)

```sql
ALTER TABLE refresh_tokens
  ADD CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE password_reset_tokens
  ADD CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE songs
  ADD CONSTRAINT fk_songs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

## 6. Верификация

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'u673267555_Metronom';
-- ожидаем 3 строки (refresh_tokens, password_reset_tokens, songs), DELETE_RULE = CASCADE

SHOW TABLE STATUS WHERE Name IN ('users','refresh_tokens','password_reset_tokens','songs');
-- ожидаем Collation = utf8mb4_unicode_ci у всех четырёх

SHOW CREATE TABLE songs;
-- ожидаем updated_at DATETIME(3)
```
