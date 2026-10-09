// Замок в шапке (решение пользователя — небольшая защита от случайных
// правок): плейлист, песня, биты, бит. Закрыт — удалять, перемещать и
// править нельзя (кнопки неактивны). Открывается долгим тапом
// (longPress.ts), закрывается обычным. Состояние — state.unlocked (свой у
// каждой страницы, app.ts).
import { h } from '../dom.ts'
import { icon } from '../icons.ts'
import { onLongPress } from './longPress.ts'

// Шапка пересобирается, как только замок открылся, — отпускание того же
// пальца (сколько бы его ни держали) приходит уже новой кнопке, и её click
// закрыл бы замок обратно. Его пропускаем; новое нажатие — уже настоящее.
let swallowClick = false

export function lockButton(opts: { unlocked: boolean; onUnlock: () => void; onLock: () => void }): HTMLButtonElement {
  const el = h(
    'button',
    {
      type: 'button',
      className: `icon-btn${opts.unlocked ? ' lock-btn--open' : ''}`,
      onClick: () => {
        if (swallowClick) swallowClick = false
        else if (opts.unlocked) opts.onLock()
      },
    },
    icon(opts.unlocked ? 'lock-simple-open' : 'lock-simple')
  )
  if (!opts.unlocked) {
    onLongPress(el, () => {
      swallowClick = true
      opts.onUnlock()
    })
  } else {
    el.classList.add('hold-btn')
    el.addEventListener('pointerdown', () => (swallowClick = false))
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }
  return el
}
