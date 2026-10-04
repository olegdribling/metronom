// Иконки Phosphor — из npm, в бандле: Service Worker прекеширует их вместе
// с приложением, и офлайн кнопки-иконки (Play в футере) не пустеют, как было
// с подключением с CDN.
import '@phosphor-icons/web/bold'
import './design/tokens.css'
import './design/components.css'
import { startApp } from './app.ts'

const root = document.getElementById('app')
if (!root) throw new Error('#app не найден в index.html')
startApp(root)
