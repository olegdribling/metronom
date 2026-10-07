// Уходят со страницы с несохранёнными правками (app.ts) — «Сохранить / Не
// сохранять / Остаться» (решение пользователя). Окно — <dialog> поверх
// приложения, вне #app (там ровно три div-а). Esc — «Остаться».
import { h } from '../dom.ts'
import { button } from './button.ts'

export type LeaveChoice = 'save' | 'discard' | 'stay'

export function askLeave(): Promise<LeaveChoice> {
  return new Promise((resolve) => {
    // Ответ — сразу по нажатию, а не по событию close: оно приходит не
    // всегда (в фоновой вкладке Chrome его не шлёт — окно «залипало»).
    const close = (choice: LeaveChoice) => {
      dialog.close()
      dialog.remove()
      resolve(choice)
    }
    const dialog = h(
      'dialog',
      { className: 'dialog' },
      h(
        'div',
        { className: 'stack' },
        h('h3', {}, 'Изменения не сохранены'),
        h(
          'div',
          { className: 'stack stack--2' },
          button('Сохранить', { variant: 'accent', iconName: 'floppy-disk', onClick: () => close('save') }),
          button('Не сохранять', { variant: 'danger', onClick: () => close('discard') }),
          button('Остаться', { onClick: () => close('stay') })
        )
      )
    )
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault()
      close('stay')
    })
    document.body.append(dialog)
    dialog.showModal()
  })
}
