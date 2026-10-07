// Замок в шапке (решение пользователя — небольшая защита от случайных
// правок): плейлист, песня, биты, бит. Закрыт — удалять, перемещать и
// править нельзя (кнопки неактивны). Открывается долгим тапом, закрывается
// обычным. Состояние — state.unlocked (свой у каждой страницы, app.ts).
import { h } from '../dom.ts'
import { icon } from '../icons.ts'

const HOLD_MS = 600

// Шапка пересобирается, как только замок открылся, — отпускание того же
// пальца (сколько бы его ни держали) приходит уже новой кнопке, и её click
// закрыл бы замок обратно. Его пропускаем; новое нажатие — уже настоящее.
let swallowClick = false

export function lockButton(opts: { unlocked: boolean; onUnlock: () => void; onLock: () => void }): HTMLButtonElement {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const el = h(
    'button',
    {
      type: 'button',
      className: `icon-btn lock-btn${opts.unlocked ? ' lock-btn--open' : ''}`,
      onClick: () => {
        if (swallowClick) swallowClick = false
        else if (opts.unlocked) opts.onLock()
      },
    },
    icon(opts.unlocked ? 'lock-simple-open' : 'lock-simple')
  )
  if (!opts.unlocked) {
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return
      clear()
      timer = setTimeout(() => {
        timer = null
        swallowClick = true
        opts.onUnlock()
      }, HOLD_MS)
    })
    el.addEventListener('pointerup', clear)
    el.addEventListener('pointerleave', clear)
    el.addEventListener('pointercancel', clear)
  } else {
    el.addEventListener('pointerdown', () => (swallowClick = false))
  }
  // Долгий тап на телефоне — без меню «скопировать/открыть».
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  return el
}
