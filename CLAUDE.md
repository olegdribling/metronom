# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Команды разработки

### client/ (Vite + React 19 + TypeScript)

```bash
cd client
npm install
npm run dev       # dev-сервер на :5173, /api проксируется на localhost:3001 (vite.config.ts)
npm run build     # tsc -b (3 project references: app/node/engine, см. ниже) + vite build → dist/
npm run preview   # просмотр собранного dist/
npm run lint      # eslint . — сейчас НЕ рабочая команда: eslint не в devDependencies, конфига нет
```

### server/ (Express + MySQL)

```bash
cd server
npm install
npm run dev       # nodemon src/app.js, читает server/.env (не в git, см. .env.example в корне)
npm start         # node src/app.js, без автоперезагрузки
npm run migrate   # CREATE TABLE IF NOT EXISTS для users/refresh_tokens/password_reset_tokens/songs — без версионирования, можно гонять повторно
```

### Тесты

В репозитории нет ни одного теста и ни одного тест-раннера (ни в `client/`, ни в `server/`). Проверка изменений — `npm run build` (типы) и ручное тестирование в браузере.

---

## Архитектура кода

### Клиент (`client/src/`)

- `main.tsx` → `App.tsx` — роутинг на React Router v6. Все авторизованные экраны идут через один маршрут `/app` → `auth/ProtectedRoute.tsx` (проверяет только наличие `tt_token` в `localStorage`, без проверки валидности) → `MetronomeApp.tsx`.
- `MetronomeApp.tsx` — единственный stateful-компонент всего приложения после логина: текущая песня, редактирование секций и паттерна, drag-and-drop (отдельно мышь и touch) для песен и секций, переключение вкладок нижней навигации (`metronome` / `songs` / `settings`). Компоненты в `metronome/*.tsx` — презентационные, состояние и обработчики приходят пропсами сверху.
- `engine/audioEngine.ts` + `engine/sampleLoader.ts` — планировщик Web Audio API по схеме lookahead: `setTimeout` каждые 25ms планирует ноты на 100ms вперёд через `AudioContext.currentTime`; события для UI (текущий бит/бар/шаг паттерна) кладутся в очередь и применяются к React-состоянию отдельным `requestAnimationFrame`-циклом — разделение нужно, чтобы рендер не мог сбить тайминг звука. Про работу с замыканиями в `audioEngine.ts` — см. раздел «Аудио движок» ниже.
- `engine/` типизирован отдельным `tsconfig.engine.json` со `strict: false` (весь остальной клиент — `tsconfig.app.json` с `strict: true`, явно исключающий `src/engine/**`). Это осознанный компромисс для аудио-кода с `any` на границах Web Audio API — не нужно «исправлять» эти `any`, ужесточая strict для всего проекта.
- `hooks/useSongs.ts` — local-first: при старте состояние читается синхронно из `localStorage`, затем (если есть сеть) перезатирается ответом сервера; каждое изменение сразу пишется в `localStorage` и с дебаунсом 1000ms отправляется на сервер.
- `api.ts` — обёртка над `fetch` с ротацией JWT: access-токен (`tt_token`, 15 минут) + refresh-токен (`tt_refresh_token`, 30 дней) в `localStorage`. При 401 запускается один общий refresh-запрос (дедуплицируется через module-level `refreshPromise`, чтобы параллельные запросы не плодили несколько refresh-вызовов), исходный запрос повторяется один раз с новым токеном.

### Сервер (`server/src/`)

- `app.js` — Express, монтирует `/api/auth` и `/api/songs`; `trust proxy 1` — потому что в продакшене перед Express всегда стоит PHP-прокси/Apache (см. «Архитектура деплоя» ниже).
- `middleware/auth.js` — проверка JWT из заголовка `Authorization: Bearer ...`, кладёт `req.userId` в запрос.
- `routes/auth.js` — register/login/refresh/logout/forgot-password/reset-password/me. Refresh- и reset-токены — случайные 64-байтные hex-строки; в БД хранятся только их SHA-256-хэши, сам токен в базу не попадает. Рейт-лимиты через `express-rate-limit`: 10 попыток/15 мин на auth-роуты, 5/час на forgot-password.
- `routes/songs.js` — все песни пользователя хранятся как один JSON-блоб в одной строке таблицы `songs` (`UNIQUE` по `user_id`), а не по одной строке на песню.
- `db/migrate.js` — миграции не версионируются: это просто набор `CREATE TABLE IF NOT EXISTS`. Чтобы добавить таблицу или индекс — дописать сюда и запустить `npm run migrate` повторно, существующие таблицы он не трогает.

### CI/CD

`.github/workflows/deploy-client.yml` и `deploy-server.yml` — автодеплой при пуше в `main` (триггерятся по изменённым путям `client/**` / `server/**` соответственно), используют SSH/SCP через секреты репозитория. Ручные команды в разделе «Деплой» ниже остаются нужны для восстановления после сбоя и ситуаций, когда требуется задеплоить вручную.

---

## Деплой

При пуше в `main` GitHub Actions деплоит автоматически (см. «CI/CD» выше). Команды ниже — для ручного/восстановительного деплоя и диагностики.

**Стоит проверить**: `deploy-server.yml` после деплоя делает `touch tmp/restart.txt` (конвенция Phusion Passenger / встроенного Hostinger "Setup Node.js App"), а весь раздел ниже описывает ручное управление процессом через `pm2`. Если сервер реально запущен через `pm2` (а не через Node.js App Manager Hostinger), `touch tmp/restart.txt` ничего не перезапустит — после автодеплоя может требоваться ручной `pm2 restart metronom-server`.

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

## Архитектура деплоя

### Почему PHP прокси

На Hostinger Business Shared Hosting `mod_proxy` заблокирован. Apache не может напрямую проксировать на порт 3001. PHP-прокси (`api/index.php`) принимает все запросы на `/api/*` и пересылает их на `http://127.0.0.1:3001/api/*`.

### API URL

`BASE_URL` в `client/src/api.ts` сейчас захардкожен как `'/api'` и не читает `VITE_API_URL` (переменная больше не используется в коде клиента). Префикс `/api` совпадает на всех уровнях: dev-прокси Vite форвардит `/api/*` на `localhost:3001` без отрезания префикса, серверные роуты смонтированы как `/api/auth` и `/api/songs`, а прод-PHP-прокси отрезает `/api`, а затем сам добавляет его обратно при обращении к `127.0.0.1:3001`. Если когда-нибудь возвращать конфигурируемость через env — помнить, что задваивание (`/api/api/...`) возникает именно от двойного добавления префикса на разных уровнях одновременно.

`.github/workflows/deploy-client.yml` всё ещё передаёт `VITE_API_URL: ''` в шаг build — сейчас это no-op, оставлено с тех пор, когда `BASE_URL` ещё вычислялся из этой переменной.

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

Файл: `client/src/theme.ts` — единственный источник цветов UI (design tokens).
Контекст: `client/src/ThemeContext.tsx` → `useTheme()`.
Типы: `client/src/types.ts` → `ThemeKey = 'purple' | 'light' | 'gray'` (gray отображается как **Minimal**).

**Правило:** никогда не хардкодить цвета (`text-white`, `text-slate-*`, `bg-slate-*`, `bg-violet-*` и т.д.) в компонентах. Только `theme.btn`, `theme.card`, `theme.textSub` и т.д. Каждый токен — полная строка Tailwind-классов (фон + бордер + hover + текст).

**Изменить существующую тему:** править значения токенов в `THEMES.<key>` — компоненты не трогать.

**Добавить новую тему:**
1. Добавить ключ в `ThemeKey` (`types.ts`)
2. Добавить блок в `THEMES` (`theme.ts`) — все поля интерфейса `Theme`
3. Заполнить `preview` (4 кружка в настройках) и `_name`
4. Проверить grep (см. ниже)

**Добавить новый тип элемента (например, badge):**
1. Добавить поле в интерфейс `Theme` (`theme.ts`)
2. Прописать во **всех** темах (`purple`, `light`, `gray`)
3. Использовать в компонентах как `theme.badge` — не дублировать классы

**Проверка на утечки** (искать хардкод в компонентах, не в `theme.ts`):
```bash
grep -rn "text-white\|text-slate\|text-gray-[0-9]\|bg-slate\|bg-violet\|bg-rose" client/src/metronome/
grep -rn "text-white\|text-slate\|text-gray-[0-9]\|bg-slate\|bg-violet\|bg-rose" client/src/pages/
grep -rn "themeId === 'purple'" client/src/
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
