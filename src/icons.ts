// Иконки — веб-шрифт Phosphor (подключён в index.html). React тут не был
// нужен и раньше: v1's Icon.tsx просто оборачивал <i class="ph-bold ph-x">.
// Здесь — та же идея как обычная функция, строящая элемент.
export function icon(name: string, className = ''): HTMLElement {
  const el = document.createElement('i')
  el.className = `ph-bold ph-${name}${className ? ' ' + className : ''}`
  el.setAttribute('aria-hidden', 'true')
  return el
}
