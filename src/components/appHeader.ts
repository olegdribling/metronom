// Шапка экрана — .app-header из каталога. Общая для всех экранов. Справа —
// кнопки страницы (замок, дискета), их собирает app.ts.
import { h } from '../dom.ts'
import { iconButton } from './button.ts'

export function appHeader(opts: {
  title: string
  showBack?: boolean
  onBack?: () => void
  actions?: HTMLElement[]
  /** Заголовок по центру шапки (экран бита): края — равные колонки сетки,
   * сколько бы кнопок ни было слева и справа. */
  centerTitle?: boolean
}): HTMLDivElement {
  const back = opts.showBack ? iconButton('arrow-left', { onClick: opts.onBack, ariaLabel: 'Назад' }) : null
  const actions = opts.actions?.length ? h('div', { className: 'app-header__actions' }, ...opts.actions) : null
  return h(
    'div',
    { className: `app-header${opts.centerTitle ? ' app-header--center' : ''}` },
    opts.centerTitle ? h('div', {}, back) : back,
    h('h2', { className: `app-header__title${opts.centerTitle ? ' app-header__title--center' : ''}` }, opts.title),
    opts.centerTitle ? (actions ?? h('div', {})) : actions
  )
}
