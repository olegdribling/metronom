// Маленький хелпер для построения DOM без фреймворка. Не виртуальный DOM,
// не реактивность — просто убирает многословность document.createElement.
// Экраны и компоненты используют это, а не пишут document.createElement
// заново каждый раз (Правила проектирования, п.4).

type Child = Node | string | null | undefined | false
type Props = Record<string, unknown> & {
  className?: string
  /** Ключ элемента (data-key) — по нему mount() после перерисовки
   * возвращает фокус, курсор в поле и прокрутку (см. mount()). */
  key?: string
  onClick?: (e: MouseEvent) => void
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  onBlur?: (e: FocusEvent) => void
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
  onBlur: 'blur',
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
    } else if (key === 'key') {
      el.dataset.key = String(value)
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

// Экраны перерисовываются целиком на каждое изменение состояния — в том
// числе пришедшее из Firestore посреди ввода. Без этого фокус и курсор
// терялись бы на каждую перерисовку (набрал букву — клавиатура закрылась), а
// горизонтальная прокрутка сеток сбрасывалась бы к началу на каждый тап.
// Поэтому mount() запоминает, какой элемент с ключом (h(..., { key }))
// был в фокусе, где стоял курсор, как были прокручены элементы с ключом, и
// возвращает это новым элементам с теми же ключами.
function captureUiState(container: Element): () => void {
  const active = document.activeElement
  const focusKey = active instanceof HTMLElement && container.contains(active) ? active.dataset.key : undefined
  let selection: [number, number] | null = null
  if (focusKey && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    try {
      if (active.selectionStart !== null && active.selectionEnd !== null) selection = [active.selectionStart, active.selectionEnd]
    } catch {
      // type="number" курсора не отдаёт
    }
  }
  const scrolls: [string, number, number][] = []
  container.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
    if (el.scrollLeft || el.scrollTop) scrolls.push([el.dataset.key!, el.scrollLeft, el.scrollTop])
  })
  const containerScroll = container.scrollTop

  return () => {
    const byKey = (key: string) => container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
    for (const [key, left, top] of scrolls) {
      const el = byKey(key)
      if (el) {
        el.scrollLeft = left
        el.scrollTop = top
      }
    }
    container.scrollTop = containerScroll
    if (!focusKey) return
    const el = byKey(focusKey)
    if (!el || el === document.activeElement) return
    el.focus({ preventScroll: true })
    if (selection && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      try {
        el.setSelectionRange(...selection)
      } catch {
        // type="number" курсора не принимает
      }
    }
  }
}

// Числовые поля (BPM, такты) — type="text" с inputmode="numeric", а не
// type="number": у number браузер не отдаёт и не принимает позицию курсора,
// и после перерисовки (mount() ниже) курсор вставал в начало — «0»,
// допечатанное к «14», давало «014». Цифровая клавиатура на телефоне та же,
// лишнее отсекает этот фильтр. Возвращает очищенное значение.
export function keepDigits(input: HTMLInputElement, maxLength: number): string {
  const digits = input.value.replace(/\D/g, '').slice(0, maxLength)
  if (digits !== input.value) {
    const caret = Math.min(digits.length, input.selectionStart ?? digits.length)
    input.value = digits
    input.setSelectionRange(caret, caret)
  }
  return digits
}

// Идёт mount(): поле в фокусе уходит из DOM (или переезжает), и браузер
// шлёт ему blur/change ещё до удаления — isConnected в этот момент true.
// Обработчики, которые по blur применяют ввод (BPM), проверяют это и не
// применяют недописанное: фокус и черновик вернутся новому полю.
let mounting = 0
export const isRemounting = (): boolean => mounting > 0

export function mount(container: Element, ...children: Child[]): void {
  mounting++
  try {
    const restore = captureUiState(container)
    clear(container)
    for (const child of children.flat() as Child[]) {
      if (child == null || child === false) continue
      container.append(child instanceof Node ? child : document.createTextNode(child))
    }
    restore()
  } finally {
    mounting--
  }
}
