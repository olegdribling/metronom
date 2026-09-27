import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Урок v1: прекешировать только реально используемые файлы, не целые папки
// «на всякий случай» (в v1 в прекеш попадал неиспользуемый набор сэмплов
// ~7.5 MB просто потому, что лежал в public/). Список ниже держим в синхроне
// с ALL_INSTRUMENTS в src/config.ts — если добавляете сэмпл в код, добавьте
// сюда и его путь.
const usedSamplePatterns = [
  'sound/Real Drum Kit/BD.wav',
  'sound/Real Drum Kit/SN.wav',
  'sound/Real Drum Kit/HH.wav',
  'sound/Voices/*.wav',
]

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}', ...usedSamplePatterns],
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
