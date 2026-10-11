// Долгий тап — защита от случайного нажатия (решение пользователя): замок
// в шапке (lockButton.ts), выход из «Концерта» (concertScreen.ts), выделение
// секции на экране песни (songScreen.ts). Палец
// держат HOLD_MS — срабатывает; отпустили или увели раньше — ничего. Кнопку
// за это время убрали (перерисовка) — тоже ничего: отпускание пришло бы уже
// другой кнопке, и таймер старой сработал бы сам. На телефоне без меню
// «скопировать/открыть» (.hold-btn в components.css).
const HOLD_MS = 600

/** ignore — элементы внутри el, долгий тап по которым не считается (кнопки
 * и квадратики в карточке секции — у них своё действие). */
export function onLongPress(el: HTMLElement, action: () => void, ignore?: string): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  el.classList.add('hold-btn')
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (ignore && (e.target as Element).closest(ignore))) return
    clear()
    timer = setTimeout(() => {
      timer = null
      if (el.isConnected) action()
    }, HOLD_MS)
  })
  el.addEventListener('pointerup', clear)
  el.addEventListener('pointerleave', clear)
  el.addEventListener('pointercancel', clear)
  el.addEventListener('contextmenu', (e) => e.preventDefault())
}
