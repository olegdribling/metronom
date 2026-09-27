// Шапка экрана — .app-header из каталога. Общая для всех экранов.
import { h } from '../dom.ts'
import { iconButton } from './button.ts'

export function appHeader(opts: { title: string; showBack?: boolean; onBack?: () => void }): HTMLElement {
  return h(
    'header',
    { className: 'app-header' },
    h('h2', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, opts.title),
    opts.showBack
      ? iconButton('arrow-left', { onClick: opts.onBack, ariaLabel: 'Назад' })
      : null
  )
}
