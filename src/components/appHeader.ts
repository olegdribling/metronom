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
}): HTMLDivElement {
  return h(
    'div',
    { className: 'app-header' },
    opts.showBack
      ? iconButton('arrow-left', { onClick: opts.onBack, ariaLabel: 'Назад' })
      : null,
    h('h2', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, opts.title),
    opts.rightAction
      ? iconButton(opts.rightAction.icon, { onClick: opts.rightAction.onClick, ariaLabel: opts.rightAction.ariaLabel })
      : null
  )
}
