# Metronom v2

PWA-метроном для музыкантов. TypeScript + Vite, без React и без Tailwind,
без собственного сервера: вход через Google (Firebase Auth), плейлисты,
песни и биты — в аккаунте пользователя (Firebase Firestore), живая
синхронизация между устройствами и работа офлайн.

Архитектура и правила разработки — см. [CLAUDE.md](CLAUDE.md).
История решений по переходу с v1 — см. `../metronom-v2-plan.md`.

```bash
npm install
npm run dev
npm test
```

Firebase-проект уже указан в `src/data/firebaseConfig.ts`; правила
Firestore — `firestore.rules` (действуют те, что опубликованы в консоли).
