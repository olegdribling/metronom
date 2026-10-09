// Долгий тап — защита от случайного нажатия (решение пользователя): замок
// в шапке (lockButton.ts), выход из «Концерта» (concertScreen.ts). Палец
// держат HOLD_MS — срабатывает; отпустили или увели раньше — ничего. Кнопку
// за это время убрали (перерисовка) — тоже ничего: отпускание пришло бы уже
// другой кнопке, и таймер старой сработал бы сам. На телефоне без меню
// «скопировать/открыть» (.hold-btn в components.css).
const HOLD_MS = 600

export function onLongPress(el: HTMLElement, action: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  el.classList.add('hold-btn')
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return
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
