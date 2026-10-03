// Экран настроек: тема оформления, голосовые подсказки на переходах
// между секциями. Список тем сейчас — одна (Minimal), но пишем как
// список, чтобы вторая/третья тема добавлялась записью в THEMES,
// а не переделкой этого экрана.
import { h, mount } from '../dom.ts'
import { icon } from '../icons.ts'
import { ThemeKey } from '../types.ts'
import { getState, subscribe, setThemeId, setVoiceCues } from '../state/appState.ts'

const THEMES: { id: ThemeKey; name: string }[] = [{ id: 'minimal', name: 'Minimal' }]

export function mountSettingsScreen(container: HTMLElement): () => void {
  function render() {
    const state = getState()
    mount(
      container,
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { padding: 'var(--space-3)', fontWeight: 'var(--font-weight-bold)' } }, 'Тема оформления'),
        ...THEMES.map((theme) =>
          h(
            'button',
            {
              type: 'button',
              className: 'list-row',
              style: { borderRadius: '0', borderLeft: 'none', borderRight: 'none' },
              onClick: () => setThemeId(theme.id),
            },
            h('span', { style: { flex: '1', textAlign: 'left' } }, theme.name),
            state.themeId === theme.id ? icon('check-circle') : null
          )
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'list-row',
            style: { borderRadius: '0', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' },
            onClick: () => setVoiceCues(!state.voiceCues),
          },
          h('span', { style: { flex: '1', textAlign: 'left' } }, 'Голос при смене секции'),
          h('span', { className: `switch${state.voiceCues ? ' switch--on' : ''}` })
        )
      )
    )
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
