// Шапка экрана — .app-header из каталога. Общая для всех экранов.
import { h } from '../dom.ts'
import { iconButton } from './button.ts'

export interface HeaderRightAction {
  icon: string
  ariaLabel: string
  onClick: () => void
}

export function appHeader(opts: {
  title: string
  showBack?: boolean
  onBack?: () => void
  rightAction?: HeaderRightAction
  /** Заголовок по центру шапки (экран бита). Ровно по центру он только при
   * кнопках с обеих сторон — у них одинаковая ширина (.icon-btn). */
  centerTitle?: boolean
}): HTMLDivElement {
  return h(
    'div',
    { className: 'app-header' },
    opts.showBack
      ? iconButton('arrow-left', { onClick: opts.onBack, ariaLabel: 'Назад' })
      : null,
    h('h2', { className: `app-header__title${opts.centerTitle ? ' app-header__title--center' : ''}` }, opts.title),
    opts.rightAction
      ? iconButton(opts.rightAction.icon, { onClick: opts.rightAction.onClick, ariaLabel: opts.rightAction.ariaLabel })
      : null
  )
}
