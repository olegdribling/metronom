// Кнопки — .btn / .icon-btn из каталога (src/design/components.css).
// Единственное место, где создаются кнопки — экраны используют эти функции,
// а не пишут <button class="..."> заново (Правила проектирования, п.1, п.4).
import { h } from '../dom.ts'
import { icon } from '../icons.ts'

export type ButtonVariant = 'default' | 'accent' | 'danger'

const variantClass: Record<ButtonVariant, string> = {
  default: '',
  accent: ' btn--accent',
  danger: ' btn--danger',
}

export function button(
  label: string | Node,
  opts: { variant?: ButtonVariant; onClick?: () => void; disabled?: boolean; iconName?: string } = {}
): HTMLButtonElement {
  const children: Node[] = []
  if (opts.iconName) children.push(icon(opts.iconName))
  children.push(label instanceof Node ? label : document.createTextNode(label))
  return h(
    'button',
    {
      type: 'button',
      className: `btn${variantClass[opts.variant ?? 'default']}`,
      onClick: opts.disabled ? undefined : opts.onClick,
      disabled: opts.disabled,
    },
    ...children
  )
}

// Несколько иконок (['caret-left', 'copy'] — «копия влево», как в тулбаре
// сетки бита) — кнопка-«таблетка» (.icon-btn--pair) вместо круга.
export function iconButton(
  iconName: string | string[],
  opts: { variant?: ButtonVariant; onClick?: () => void; ariaLabel: string; disabled?: boolean }
): HTMLButtonElement {
  const icons = Array.isArray(iconName) ? iconName : [iconName]
  const cls =
    (opts.variant === 'accent' ? ' icon-btn--accent' : opts.variant === 'danger' ? ' icon-btn--danger' : '') +
    (icons.length > 1 ? ' icon-btn--pair' : '')
  return h(
    'button',
    {
      type: 'button',
      className: `icon-btn${cls}`,
      onClick: opts.disabled ? undefined : opts.onClick,
      disabled: opts.disabled,
      'aria-label': opts.ariaLabel,
    },
    ...icons.map((name) => icon(name))
  )
}
