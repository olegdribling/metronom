# CLAUDE.md — Metronom Project

## Общее

PWA-метроном для музыкантов. Vite + React 19 + TypeScript на клиенте, Express + MySQL на сервере.
Всё задеплоено на Hostinger Business Web Hosting.

## Репозиторий

GitHub: `git@github.com:olegdribling/metronom.git`
Ветка: `main`

---

## Структура

```
metronom/
├── client/          # Фронтенд (Vite + React 19 + TypeScript)
└── server/          # Бэкенд (Node.js + Express + MySQL)
```

---

## Деплой

### Доступ к серверу

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238
```

SSH-ключ уже добавлен в Hostinger. На новом компе нужно:
1. Сгенерировать новый ключ: `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519`
2. Добавить публичный ключ в hPanel → Advanced → SSH Access → Add SSH key

### Стандартный деплой (после изменений в client/)

```bash
# 1. Пушим на GitHub
git add -A && git commit -m "описание" && git push

# 2. На сервере: pull + build + deploy
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
  cd ~/metronom && git pull
  cd client && npm run build
  PUBDIR=~/domains/slateblue-crow-206906.hostingersite.com/public_html
  cp -r dist/. $PUBDIR/
  mkdir -p $PUBDIR/api
  cp /tmp/ap2.php $PUBDIR/api/index.php
  cp /tmp/ah2 $PUBDIR/api/.htaccess
  echo deployed
'
```

**ВАЖНО**: После деплоя клиент кешируется Service Worker. Пользователю нужно:
DevTools → Application → Service Workers → Unregister → Cmd+Shift+R

### Деплой изменений в server/

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
  cd ~/metronom && git pull
  cd server && npm install
  pm2 restart metronom-server
'
```

### Проверить что сервер работает

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && pm2 status'
curl https://slateblue-crow-206906.hostingersite.com/api/health
```

### Если сервер упал (pm2 не запущен после перезагрузки хостинга)

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
  cd ~/metronom/server
  pm2 start src/app.js --name metronom-server
  pm2 save
'
```

### Если PHP-прокси слетел (api/ папка удалена при деплое)

```bash
ssh -p 65002 -i ~/.ssh/id_ed25519 u673267555@153.92.9.238 '
  PUBDIR=~/domains/slateblue-crow-206906.hostingersite.com/public_html

  # Создать PHP прокси
  mkdir -p $PUBDIR/api
  cat > $PUBDIR/api/index.php << '"'"'PHPEOF'"'"'
<?php
$path = $_SERVER["REQUEST_URI"];
$path = preg_replace("#^/api#", "", $path);
if ($path === "" || $path === false) $path = "/";
$url = "http://127.0.0.1:3001/api" . $path;
$method = $_SERVER["REQUEST_METHOD"];
$headers = [];
foreach (getallheaders() as $k => $v) {
    if (strtolower($k) !== "host") $headers[] = "$k: $v";
}
$body = file_get_contents("php://input");
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
$response = curl_exec($ch);
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$response_headers = substr($response, 0, $header_size);
$response_body = substr($response, $header_size);
curl_close($ch);
http_response_code($status);
foreach (explode("\r\n", $response_headers) as $h) {
    if (preg_match("#^(Content-Type|Authorization|Cache-Control):(.+)$#i", $h)) header($h);
}
echo $response_body;
PHPEOF

  # .htaccess для api/
  cat > $PUBDIR/api/.htaccess << EOF
RewriteEngine On
RewriteRule ^ index.php [L]
EOF

  # root .htaccess (SPA fallback)
  cat > $PUBDIR/.htaccess << EOF
RewriteEngine On
RewriteRule ^api/ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
EOF

  echo done
'
```

---

## Архитектура

### Почему PHP прокси

На Hostinger Business Shared Hosting `mod_proxy` заблокирован. Apache не может напрямую проксировать на порт 3001. PHP-прокси (`api/index.php`) принимает все запросы на `/api/*` и пересылает их на `http://127.0.0.1:3001/api/*`.

### API URL

`VITE_API_URL` / `BASE_URL` в `api.ts` должен быть **пустой строкой** при деплое на Hostinger (запросы идут на `/auth/...`, `/songs`). Никогда не ставить `VITE_API_URL=/api` — тогда URL задваивается (`/api/api/...`).

### База данных

- Host: `127.0.0.1` (не `localhost` — резолвится в IPv6 и даёт Access denied)
- DB: `u673267555_Metronom`
- User: `u673267555_metro`
- Port: `3306`
- `.env` лежит в `~/metronom/server/.env` на сервере (не в git)

### Node.js на сервере

Установлен через nvm. Всегда нужно загружать окружение:
```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
```

Процесс управляется через pm2 (`metronom-server`). `pm2 startup` не работает на shared hosting — при перезагрузке сервера нужно запускать вручную.

---

## Клиент

### Темы

Файл: `client/src/theme.ts`
Типы: `client/src/types.ts` → `ThemeKey = 'purple' | 'gray' | 'light'`

Правило: никогда не хардкодить цвета (`text-white`, `bg-slate-800` и т.д.) прямо в компонентах. Все цвета — через `theme.*` из `useTheme()`. Проверять командой:
```bash
grep -rn "text-white\|text-slate\|bg-slate\|bg-violet" client/src/metronome/
```

### Аудио движок

`client/src/engine/audioEngine.ts` — `useCallback` захватывает значения замыканием. Если нужно передать изменяемый параметр (например, `voiceCues`) — использовать ref:
```ts
const myRef = useRef(myProp)
useEffect(() => { myRef.current = myProp }, [myProp])
// Внутри schedule использовать myRef.current
```

### Сэмплы

`client/src/config.ts` — `ALL_INSTRUMENTS` = сумма всех массивов сэмплов. При добавлении новых групп сэмплов обязательно добавлять в `ALL_INSTRUMENTS`, иначе `sampleLoader` их не загрузит.

Путь к файлам: `sound/Voices/`, `sound/Real Drum Kit/`, `sound/Pearl Real Kit/` — относительно `public/`.

Нет файла `end.wav` — вместо него используется `outro.wav` для голосовой подсказки "конец".

### Голосовые подсказки

Логика в `audioEngine.ts`: на последнем такте каждой секции — beat 1 = название следующей секции (`voice_CHORUS` и т.д.) или `voice_END`, beats 2/3/4 = `voice_2/3/4`. Управляется через `voiceCuesRef`.

### Сохранение песен

`client/src/hooks/useSongs.ts` — сразу читает из `localStorage` (ключ `metronom_songs`), затем синхронизирует с сервером. Дебаунс 1000ms перед PUT.

### Роутинг

React Router v6. Базовый путь `/` (не `/metronom/` — это было для GitHub Pages, от которого отказались).

---

## Сервер

### Маршруты

- `GET/PUT /api/songs` — песни пользователя (JSON blob)
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход
- `POST /api/auth/refresh` — обновление токена
- `GET /api/auth/me` — текущий пользователь
- `POST /api/auth/logout` — выход
- `GET /api/health` — проверка работы

### MySQL нюансы

- Плейсхолдеры: `?` (не `$1`)
- Нет `RETURNING` — использовать `result.insertId`
- Деструктуризация: `const [rows] = await pool.execute(...)`
- Даты: `DATE_ADD(NOW(), INTERVAL 30 DAY)`

---

## Git

Не добавлять `Co-Authored-By: Claude` в коммиты — пользователь против.
