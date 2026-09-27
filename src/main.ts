import './design/tokens.css'
import './design/components.css'
import { startApp } from './app.ts'

const root = document.getElementById('app')
if (!root) throw new Error('#app не найден в index.html')
startApp(root)
