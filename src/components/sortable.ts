// Перестановка строк списка долгим тапом (решение пользователя): песни в
// плейлисте, биты. Подержать строку (HOLD_MS, как у долгого тапа) — она
// поднимается; ведёшь пальцем вверх-вниз — остальные раздвигаются;
// отпустил — новое место (onMove). Строки сдвигаются transform'ом, у краёв
// области прокрутки она сама едет. Сдвинул палец раньше, чем строка
// поднялась, — это прокрутка. Отпускание после подъёма не открывает строку
// (click глушится).
//
// Пока строку держат и ведут, экран со списком не перерисовывается
// (deferWhileSorting в начале его render): перерисовка заменила бы список, и
// строка не поднималась или падала бы на полпути — а снимок от только что
// сделанной перестановки приходит как раз к следующему долгому тапу.
// Отложенная перерисовка — когда отпустили.
import { HOLD_MS } from './longPress.ts'

const SLOP_PX = 8
const EDGE_PX = 48
const EDGE_STEP_PX = 10

export interface SortableOptions {
  /** Можно ли переставлять сейчас (замок открыт). */
  enabled(): boolean
  /** Кнопки строки, долгий тап по которым её не поднимает (▶, корзина). */
  ignore?: string
  /** Места — в списке, каким он нарисован. */
  onMove(from: number, to: number): void
}

interface Press {
  x: number
  y: number
  index: number
  pointerId: number
}

interface Drag {
  index: number
  items: HTMLElement[]
  /** Середины строк — в координатах прокручиваемого содержимого. */
  centers: number[]
  /** На сколько раздвигаются соседи: высота строки + промежуток. */
  shift: number
  startY: number
  startScroll: number
  lastY: number
  target: number
}

/** Список, строку которого держат или ведут, и отложенная перерисовка его
 * экрана. */
let held: { list: HTMLElement; render: (() => void) | null } | null = null

/** В начале render() экрана со списком: строку держат или ведут — экран
 * перерисуется, когда её отпустят (true — сейчас не рисовать). */
export function deferWhileSorting(container: HTMLElement, render: () => void): boolean {
  if (!held || !held.list.isConnected || !container.contains(held.list)) return false
  held.render = render
  return true
}

export function makeSortable(list: HTMLElement, opts: SortableOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let press: Press | null = null
  let drag: Drag | null = null
  let swallowClick = false
  let raf: number | null = null

  list.classList.add('sortable')
  const items = () => [...list.children] as HTMLElement[]
  const scroller = (): HTMLElement => list.closest<HTMLElement>('.screen') ?? (document.scrollingElement as HTMLElement)

  function update() {
    if (!drag) return
    const d = drag
    const dy = d.lastY - d.startY + (scroller().scrollTop - d.startScroll)
    const center = d.centers[d.index] + dy
    let target = d.index
    d.items.forEach((item, i) => {
      if (i === d.index) return
      let offset = 0
      if (i > d.index && center > d.centers[i]) {
        offset = -d.shift
        target = Math.max(target, i)
      } else if (i < d.index && center < d.centers[i]) {
        offset = d.shift
        target = Math.min(target, i)
      }
      item.style.transform = offset ? `translateY(${offset}px)` : ''
    })
    d.items[d.index].style.transform = `translateY(${dy}px)`
    d.target = target
  }

  // У верхнего и нижнего края области прокрутки она едет сама — длинный
  // плейлист перетаскивается целиком.
  function edgeScroll() {
    raf = null
    if (!drag) return
    if (!list.isConnected) return finish(false)
    const sc = scroller()
    const r = sc.getBoundingClientRect()
    const step = drag.lastY < r.top + EDGE_PX ? -EDGE_STEP_PX : drag.lastY > r.bottom - EDGE_PX ? EDGE_STEP_PX : 0
    if (step) {
      const before = sc.scrollTop
      sc.scrollTop += step
      if (sc.scrollTop !== before) update()
    }
    raf = requestAnimationFrame(edgeScroll)
  }

  function lift() {
    timer = null
    const p = press
    if (!p) return
    if (!list.isConnected) return finish(false)
    const all = items()
    const sc = scroller()
    const top = sc.getBoundingClientRect().top
    const rects = all.map((item) => item.getBoundingClientRect())
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0
    drag = {
      index: p.index,
      items: all,
      centers: rects.map((r) => r.top - top + sc.scrollTop + r.height / 2),
      shift: rects[p.index].height + gap,
      startY: p.y,
      startScroll: sc.scrollTop,
      lastY: p.y,
      target: p.index,
    }
    swallowClick = true
    all.forEach((item, i) => item.classList.add(i === p.index ? 'list-item--lifted' : 'list-item--shifting'))
    try {
      list.setPointerCapture(p.pointerId)
    } catch {
      // указатель уже отпущен — отпускание придёт обычным путём
    }
    raf = requestAnimationFrame(edgeScroll)
  }

  function finish(commit: boolean) {
    if (timer !== null) clearTimeout(timer)
    timer = null
    press = null
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerCancel, true)
    window.removeEventListener('blur', cancel)
    const d = drag
    drag = null
    d?.items.forEach((item) => {
      item.style.transform = ''
      item.classList.remove('list-item--lifted', 'list-item--shifting')
    })
    // Перерисовка от onMove — тоже отложенная: экран нарисуется один раз.
    if (d && commit && list.isConnected && d.target !== d.index) opts.onMove(d.index, d.target)
    const mine = held?.list === list ? held : null
    if (mine) held = null
    const render = mine?.render
    // Список ушёл с экрана (перешли на другую страницу) — рисовать нечего.
    if (!render || !list.isConnected) return
    // Строку переставляли — сразу. Просто тап — после click: иначе нажатая
    // строка ушла бы из DOM раньше него, и тап потерялся бы.
    if (d) render()
    else setTimeout(() => list.isConnected && render())
  }

  function onPointerMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return
    if (drag) {
      drag.lastY = e.clientY
      update()
    } else if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) {
      // Повели раньше, чем строка поднялась, — это прокрутка.
      finish(false)
    }
  }
  function onPointerUp(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finish(true)
  }
  function onPointerCancel(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finish(false)
  }
  const cancel = () => finish(false)

  list.addEventListener('pointerdown', (e) => {
    swallowClick = false
    const target = e.target as Element
    if (!e.isPrimary || e.button !== 0 || press || !opts.enabled() || (opts.ignore && target.closest(opts.ignore))) return
    let item: Element | null = target
    while (item && item.parentElement !== list) item = item.parentElement
    const index = item ? items().indexOf(item as HTMLElement) : -1
    if (index < 0) return
    press = { x: e.clientX, y: e.clientY, index, pointerId: e.pointerId }
    held = { list, render: null }
    timer = setTimeout(lift, HOLD_MS)
    // Отпустили где угодно (в том числе за списком) — держать перестали:
    // иначе экран так и ждал бы с перерисовкой.
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerCancel, true)
    window.addEventListener('blur', cancel)
  })
  // Пока строку тащат — страница не прокручивается за пальцем.
  list.addEventListener('touchmove', (e) => drag && e.cancelable && e.preventDefault(), { passive: false })
  list.addEventListener('contextmenu', (e) => (press || drag) && e.preventDefault())
  list.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
      e.preventDefault()
    },
    true
  )
}
