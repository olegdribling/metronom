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

export function iconButton(
  iconName: string,
  opts: { variant?: ButtonVariant; onClick?: () => void; ariaLabel: string }
): HTMLButtonElement {
  const cls =
    opts.variant === 'accent' ? ' icon-btn--accent' : opts.variant === 'danger' ? ' icon-btn--danger' : ''
  return h(
    'button',
    { type: 'button', className: `icon-btn${cls}`, onClick: opts.onClick, 'aria-label': opts.ariaLabel },
    icon(iconName)
  )
}
