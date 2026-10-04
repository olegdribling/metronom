// Иконки — веб-шрифт Phosphor (импорт в main.ts). React тут не был
// нужен и раньше: v1's Icon.tsx просто оборачивал <i class="ph-bold ph-x">.
// Здесь — та же идея как обычная функция, строящая элемент.
import { drumSvgMarkup } from './components/drumIcons.ts'

export function icon(name: string, className = ''): HTMLElement {
  const el = document.createElement('i')
  el.setAttribute('aria-hidden', 'true')
  // Барабана в Phosphor нет (ph-drum не существует — кнопка «Биты» была
  // пустым кружком) — свой SVG малого барабана из сетки бита, размером с
  // иконку шрифта и той же жирности линий.
  if (name === 'drum') {
    el.className = `icon-svg${className ? ' ' + className : ''}`
    el.innerHTML = drumSvgMarkup('snare', 2.2)
    return el
  }
  el.className = `ph-bold ph-${name}${className ? ' ' + className : ''}`
  return el
}
