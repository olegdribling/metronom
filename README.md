# Metronom v2

PWA-метроном для музыкантов. TypeScript + Vite, без React и без Tailwind,
без собственного сервера — данные и живая совместная работа над плейлистом
песен через Firebase Firestore.

Архитектура и правила разработки — см. [CLAUDE.md](CLAUDE.md).
История решений по переходу с v1 — см. `../metronom-v2-plan.md`.

```bash
npm install
npm run dev
```

Перед первым использованием плейлистов заполните
`src/data/firebaseConfig.ts` данными вашего Firebase-проекта (инструкция —
в комментарии в файле).
