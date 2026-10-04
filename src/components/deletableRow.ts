// Строка списка с красной корзиной справа — удалить элемент с
// подтверждением (решение пользователя): биты (beatsScreen.ts), песни
// (playlistScreen.ts). Сама строка (.list-row) — кнопка открытия, корзина —
// отдельная кнопка рядом: кнопка в кнопке в HTML недопустима.
import { h } from '../dom.ts'
import { iconButton } from './button.ts'

export interface DeletableRowOptions {
  /** Текст подтверждения — что удаляется и что будет после. */
  confirmText: string
  ariaLabel: string
  onDelete: () => void
}

export function deletableRow(row: HTMLElement, opts: DeletableRowOptions): HTMLElement {
  return h(
    'div',
    { className: 'list-item' },
    row,
    iconButton('trash', {
      variant: 'danger',
      ariaLabel: opts.ariaLabel,
      onClick: () => {
        if (confirm(opts.confirmText)) opts.onDelete()
      },
    })
  )
}
