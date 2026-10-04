import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Урок v1: прекешировать только реально используемые файлы, не целые папки
// «на всякий случай» (в v1 в прекеш попадал неиспользуемый набор сэмплов
// ~7.5 MB просто потому, что лежал в public/). Список ниже держим в синхроне
// с ALL_INSTRUMENTS в src/config.ts — если добавляете сэмпл в код, добавьте
// сюда и его путь.
const usedSamplePatterns = [
  'sound/Real Drum Kit/*.wav',
  'sound/Pearl Real Kit/*.wav',
  'sound/Voices/*.wav',
]

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // woff2 — шрифт иконок Phosphor (main.ts). Его же SVG/TTF/WOFF Vite
        // кладёт в dist (на них ссылается CSS пакета), но браузеры берут
        // woff2 — остальные в прекеш не нужны (SVG-шрифт — 2.9 MB).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', ...usedSamplePatterns],
        globIgnores: ['**/Phosphor-Bold-*.svg'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'Metronom',
        short_name: 'Metronom',
        description: 'PWA-метроном для музыкантов',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
