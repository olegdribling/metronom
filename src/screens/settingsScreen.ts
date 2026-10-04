// Экран настроек: аккаунт (вход через Google / выход), тема оформления,
// голосовые подсказки на переходах между секциями. Список тем сейчас — одна (Minimal), но пишем как
// список, чтобы вторая/третья тема добавлялась записью в THEMES,
// а не переделкой этого экрана.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { icon } from '../icons.ts'
import { ThemeKey } from '../types.ts'
import { getState, subscribe, setThemeId, setVoiceCues, signOut } from '../state/appState.ts'

const THEMES: { id: ThemeKey; name: string }[] = [{ id: 'minimal', name: 'Minimal' }]

export function mountSettingsScreen(container: HTMLElement): () => void {
  function renderAccount(): HTMLElement {
    const gate = accountGate('Войдите — песни, плейлисты и биты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) return gate
    return h(
      'div',
      { className: 'card row row--3' },
      icon('user-circle'),
      h('div', { className: 'grow min-w-0' },
        h('div', { className: 'text-small text-sub' }, 'Аккаунт Google'),
        h('div', { className: 'text-bold text-ellipsis' }, getState().user!.name)
      ),
      button('Выйти', { onClick: () => signOut().catch((err) => console.error('Не удалось выйти из аккаунта:', err)) })
    )
  }

  function render() {
    const state = getState()
    mount(
      container,
      h(
        'div',
        { className: 'stack stack--4' },
        renderAccount(),
        h(
          'div',
          { className: 'card settings-list' },
          h('div', { className: 'settings-list__title' }, 'Тема оформления'),
          ...THEMES.map((theme) =>
            h(
              'button',
              { type: 'button', className: 'list-row list-row--flat', onClick: () => setThemeId(theme.id) },
              h('span', { className: 'grow' }, theme.name),
              state.themeId === theme.id ? icon('check-circle') : null
            )
          ),
          h(
            'button',
            { type: 'button', className: 'list-row list-row--flat list-row--last', onClick: () => setVoiceCues(!state.voiceCues) },
            h('span', { className: 'grow' }, 'Голос при смене секции'),
            h('span', { className: `switch${state.voiceCues ? ' switch--on' : ''}` })
          )
        )
      )
    )
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
