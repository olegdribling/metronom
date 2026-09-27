// Маленький хелпер для построения DOM без фреймворка. Не виртуальный DOM,
// не реактивность — просто убирает многословность document.createElement.
// Экраны и компоненты используют это, а не пишут document.createElement
// заново каждый раз (Правила проектирования, п.4).

type Child = Node | string | null | undefined | false
type Props = Record<string, unknown> & {
  className?: string
  onClick?: (e: MouseEvent) => void
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  onKeyDown?: (e: KeyboardEvent) => void
  onTouchStart?: (e: TouchEvent) => void
  onTouchMove?: (e: TouchEvent) => void
  onTouchEnd?: (e: TouchEvent) => void
  onDragStart?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  style?: Partial<CSSStyleDeclaration>
  dataset?: Record<string, string>
}

const EVENT_PROPS: Record<string, keyof HTMLElementEventMap> = {
  onClick: 'click',
  onInput: 'input',
  onChange: 'change',
  onKeyDown: 'keydown',
  onTouchStart: 'touchstart',
  onTouchMove: 'touchmove',
  onTouchEnd: 'touchend',
  onDragStart: 'dragstart',
  onDragOver: 'dragover',
  onDrop: 'drop',
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue
    if (key === 'className') {
      el.className = String(value)
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value)
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(el.dataset, value)
    } else if (key in EVENT_PROPS) {
      el.addEventListener(EVENT_PROPS[key], value as EventListener)
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '')
      else el.removeAttribute(key)
    } else {
      el.setAttribute(key, String(value))
    }
  }

  for (const child of children.flat() as Child[]) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(child))
  }

  return el
}

export function clear(el: Element): void {
  el.replaceChildren()
}

export function mount(container: Element, ...children: Child[]): void {
  clear(container)
  for (const child of children.flat() as Child[]) {
    if (child == null || child === false) continue
    container.append(child instanceof Node ? child : document.createTextNode(child))
  }
}
