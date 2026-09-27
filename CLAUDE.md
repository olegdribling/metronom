# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Общее

PWA-метроном для музыкантов. v2 — полная перестройка с нуля (2026-09-27,
см. `../metronom-v2-plan.md` для истории решений). TypeScript + Vite,
**без React, без Tailwind**, без собственного сервера. Данные и живая
синхронизация — Firebase Firestore. Статика деплоится на тот же домен
Hostinger, что и раньше.

Если ищете описание архитектуры v1 (React + Express + MySQL) — она удалена
целиком, см. `git log` до коммита `v2 reset` и `../metronom-v2-plan.md`.

## Репозиторий

GitHub: `git@github.com:olegdribling/metronom.git`
Ветка: `main`

---

## Структура

```
metronom/
├── src/
│   ├── main.ts              # точка входа
│   ├── app.ts                # роутер + общий хедер/футер + переключение экранов
│   ├── router.ts              # самописный роутер (без React Router)
│   ├── dom.ts                  # h()/mount() — построение DOM без фреймворка
│   ├── icons.ts                 # иконки — веб-шрифт Phosphor
│   ├── types.ts                  # Song/Section/Pattern/Playlist и т.д.
│   ├── config.ts                  # константы, список сэмплов
│   ├── design/
│   │   ├── tokens.css               # цвета/отступы/радиусы/типографика — CSS-переменные
│   │   └── components.css            # каталог UI-элементов (.btn, .card, .beat, ...)
│   ├── engine/
│   │   ├── audioEngine.ts             # lookahead-планировщик Web Audio
│   │   └── sampleLoader.ts             # загрузка и декодирование сэмплов
│   ├── data/
│   │   ├── firebaseConfig.ts           # конфиг Firebase-проекта (не секрет, см. файл)
│   │   ├── firebase.ts                  # инициализация Firestore
│   │   ├── playlistApi.ts                # прямые операции с Firestore
│   │   ├── playlistSession.ts             # подписка + дебаунс-запись правок
│   │   └── knownPlaylists.ts               # localStorage-список кодов плейлистов
│   ├── state/appState.ts                    # общее состояние приложения (pub/sub)
│   ├── components/                            # button.ts, appHeader.ts, appFooter.ts
│   └── screens/                                 # metronomeScreen, playlistScreen,
│                                                  # songScreen, patternScreen, settingsScreen
├── public/sound/                                  # сэмплы (drum kits, голоса)
├── sound/                                          # исходная резервная копия сэмплов (не деплоится)
├── tests/audioEngine.test.ts                        # smoke-тест тайминга движка
└── .github/workflows/deploy.yml                      # build + test + деплой, один workflow
```

---

## Команды разработки

```bash
npm install
npm run dev       # dev-сервер Vite на :5173
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # просмотр собранного dist/
npm test          # node --test — smoke-тест аудио-движка (tests/audioEngine.test.ts)
```

### Тесты

`tests/audioEngine.test.ts` — единственный тест-файл. Node-овский `node --test`
(через `tsx`, без отдельного тест-раннера) с самодельными заглушками
`AudioContext`/`fetch`/`requestAnimationFrame` (Node не умеет Web Audio) —
проверяет счёт долей/тактов, самоостановку непетлевой песни и то, что смена
BPM во время игры реально влияет на тайминг, а не только на следующий
`start()`. См. комментарии в файле — там же объяснение неочевидных таймингов
теста.

Кроме этого — `npm run build` (типы + сборка) перед любым коммитом.

---

## Архитектура кода

### Экраны и роутинг

Без React → без React Router. `router.ts` — самописный: путь → функция
рендера (`history.pushState`, паттерны `/song/:id`). `app.ts` — единственное
место, где роутер связывается с экранами; держит один `AudioEngine` на всё
приложение и общий хедер/футер (`components/appHeader.ts`,
`components/appFooter.ts`).

Маршруты: `/metronome`, `/playlist`, `/song/:id`, `/song/:id/pattern`,
`/settings`. Всё остальное (включая `/`) редиректит на `/metronome`.

### Состояние

`state/appState.ts` — простой pub/sub (не Redux, не фреймворк): один объект
`AppState`, `subscribe(cb)` на изменения, `patchState()`/`saveSongs()` и
т.д. на запись. Экраны сами решают, что перерисовывать при уведомлении —
никакой виртуальный DOM ничего не диффит за них.

**Горячий путь — исключение из этого правила.** Подсветка текущей доли
(`screens/metronomeScreen.ts`) и текущего шага паттерна
(`screens/patternScreen.ts`) обновляются НАПРЯМУЮ в DOM из
`engine.onPlaybackState(...)`, в обход `appState`/перерисовки экрана —
иначе на 24 кадрах в секунду есть риск, что рендер собьёт аудио-тайминг
(тот же принцип, что был в v1 с React, просто без React в середине).

### Построение DOM

Без фреймворка — `dom.ts` даёт `h(tag, props, ...children)` (тонкая
обёртка над `document.createElement`, не виртуальный DOM) и `mount()`
(заменить детей контейнера). Экраны и компоненты используют только это,
не пишут `document.createElement` россыпью.

### Дизайн-система

`design/tokens.css` — единственный источник цвета/отступов/радиусов/
типографики, CSS custom properties. Тема переключается атрибутом
`data-theme` на `<html>` (`state/appState.ts` → `setThemeId`). Сейчас одна
тема (Minimal) — добавление второй (`light`/`dark`) означает **только**
новый блок `[data-theme="..."]` в `tokens.css`, компоненты не трогаются
(так и задумано, см. `metronom-v2-plan.md`).

`design/components.css` — каталог переиспользуемых классов (`.btn`,
`.icon-btn`, `.card`, `.input`, `.list-row`, `.beat`, `.step`, `.badge`,
`.app-header`, `.app-footer`, `.sheet`). **Правило**: перед новым экраном —
искать подходящий класс здесь, использовать его, а не писать инлайн-стиль
с нуля. Новый переиспользуемый элемент — сюда же, в комментарий-список
в начале файла.

**Частый источник бага** (уже наступали): у модификатора (`.btn--accent`,
`.icon-btn--danger` и т.д.) и у `:hover`/`:active` на базовом классе
(`.btn:hover`) одинаковая специфичность CSS (один класс = один класс+один
псевдокласс на самом деле ВЫШЕ — `.icon-btn:hover` специфичнее
`.icon-btn--accent`!). Если у модификатора нет своего `:hover`-переопределения,
дефолтный hover-фон побеждает акцентный цвет, и светлая иконка становится
не видна на светлом фоне. Добавляя новый цветной вариант кнопки — сразу
добавить и его `:hover`.

### Аудио-движок

`engine/audioEngine.ts` + `engine/sampleLoader.ts` — тот же алгоритм, что
был в v1: `setTimeout` каждые 25ms планирует ноты на 100ms вперёд через
`AudioContext.currentTime`; события для UI кладутся в очередь и
применяются отдельным `requestAnimationFrame`-циклом. Фабричные функции с
замыканиями вместо React-хука (`createAudioEngine()`), `{ current }`-объект
вместо `useRef`, колбэки (`onPlaybackState`, `onPlayingChange`, ...) вместо
`useState`.

Один `AudioContext` на всё приложение — создаётся один раз через
`ensureAudioContext()` внутри `audioEngine.ts` (при создании движка, чтобы
декодирование сэмплов не зависело от того, выбрана ли песня — см. ниже) и
переиспользуется и для декодирования, и для воспроизведения. Не создавать
второй через `new AudioContext()` в другом месте — сэмплы, декодированные
через один контекст, всё ещё должны воспроизводиться, но плодить лишние
контексты незачем.

**Изменение BPM во время игры** применяется без остановки/перезапуска —
естественное следствие того, что `schedule()` читает `bpm` из замыкания на
каждой итерации, а не из захваченных при последнем вызове параметров (в
v1 с `useCallback` это было не так, BPM обновлялся только после
стоп/старта). Не буквально мгновенно — уже запланированная на старом
темпе доля довисит, новый темп стартует со следующей. См.
`tests/audioEngine.test.ts`.

**samplesLoaded не завязан на выбор песни.** В v1 `preloadAllSamples()`
запускался только при выборе песни — значит голый метроном без песни был
неиграбелен (кнопка Play заблокирована до `samplesLoaded`). В v2 движок
декодирует все сэмплы сразу при создании (`createAudioEngine()`), не
дожидаясь песни — метроном первая фича по плану, должна работать без неё.

### Данные и синхронизация (Firebase Firestore)

`data/playlistApi.ts` — прямые операции: `createPlaylist()` (генерирует
код, создаёт `playlists/{code}`), `playlistExists()`, `subscribeToPlaylist()`
(`onSnapshot`), `writeSongs()`. `data/playlistSession.ts` — стейтфул-обёртка
поверх этого: подписка + дебаунсированная запись (`CONFIG.SAVE_DEBOUNCE_MS`),
без optimistic lock — конфликт решает **last-write-wins** на уровне
Firestore, версии не сравниваются (осознанное решение, см. план — для
band-плейлиста это не оверинжиниринг).

`data/knownPlaylists.ts` — localStorage-список кодов плейлистов, которые
устройство создавало/открывало (`metronom_known_playlists`) — личный
«список плейлистов» без какого-либо аккаунта.

**Перед первым использованием** — обязательно заполнить
`src/data/firebaseConfig.ts` данными реального Firebase-проекта (инструкция
в комментарии в файле). Без этого `getDb()` бросает понятную ошибку, а
экран плейлиста показывает подсказку вместо падения.

### PWA / прекеш

`vite.config.ts` → `vite-plugin-pwa`, `globPatterns` держится в синхроне
со списком реально используемых сэмплов в `src/config.ts`
(`ALL_INSTRUMENTS`) — добавили новый сэмпл в код, добавьте и в
`globPatterns`, иначе он либо не прекешируется (обычно не страшно — просто
не будет работать офлайн до первой загрузки онлайн), либо, если убрали из
кода но не из `globPatterns`, сборка предупредит, что паттерн ничего не
поймал.

---

## Деплой

Один workflow (`.github/workflows/deploy.yml`): typecheck + `npm test` +
`vite build` + SCP `dist/` на тот же Hostinger-домен, что и в v1
(`slateblue-crow-206906.hostingersite.com`). Бэкенда больше нет — значит
нет pm2, нет PHP-прокси, нет отдельного серверного деплоя.

`public/.htaccess` — SPA-fallback для самописного роутера (без него
обновление страницы на `/playlist` или `/song/:id` даст 404 от Apache
вместо `index.html`). Он же означает, что `/api/...` и вообще любой
несуществующий путь тоже вернёт `index.html` с 200 — это нормально,
проверять деплой по факту (что в `index.html`/бандле), а не по статус-коду.

**После любого деплоя браузер может показывать старую версию** —
PWA (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) кэширует себя через
Service Worker. Смотрите не только на сервер (`curl`/содержимое
`dist/index.html`), а и на то, что реально отдаёт браузеру SW. Сброс:
DevTools → Application → Service Workers → Unregister → Cmd+Shift+R,
или просто открыть в приватном окне (это уже было граблями в v1).

SSH-доступ и структура `~/domains/<домен>/public_html` — как в v1
(см. `git log` до `v2 reset`, если нужны детали восстановления доступа).

---

## Git

Не добавлять `Co-Authored-By: Claude` в коммиты — пользователь против.
