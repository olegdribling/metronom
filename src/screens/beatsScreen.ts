// Экран библиотеки битов/брейков: список (локальный, без Firestore, см.
// data/beatsLibrary.ts) + создание + добавление чужого бита по коду (разовая
// передача, см. data/sharedBeatApi.ts). Сам редактор — beatEditorScreen.ts.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { icon } from '../icons.ts'
import { BEAT_BAR_OPTIONS } from '../config.ts'
import { Beat, BeatKind } from '../types.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'
import { fetchSharedBeat } from '../data/sharedBeatApi.ts'
import { isFirebaseConfigured } from '../data/firebase.ts'

function barsLabel(n: number): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod10 === 1 && mod100 !== 11) return `${n} такт`
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} такта`
  return `${n} тактов`
}

const createEmptyBeat = (name: string, kind: BeatKind, bars: number): Beat => ({
  id: `beat_${Date.now()}`,
  kind,
  name: name.trim() || (kind === 'beat' ? 'Новый бит' : 'Новый брейк'),
  bars,
  tracks: [],
})

export function mountBeatsScreen(container: HTMLElement, onOpenBeat: (beatId: string) => void): () => void {
  let newName = ''
  let newKind: BeatKind = 'beat'
  let newBars = BEAT_BAR_OPTIONS[1] // 2 такта по умолчанию
  let joinCode = ''
  let busy = false
  let errorMessage: string | null = null

  function handleAdd() {
    const state = getState()
    saveBeats([...state.beats, createEmptyBeat(newName, newKind, newBars)])
    newName = ''
    render()
  }

  async function handleAddByCode(code: string) {
    const trimmed = code.trim().toLowerCase()
    if (!trimmed || busy) return
    busy = true
    errorMessage = null
    render()
    try {
      const shared = await fetchSharedBeat(trimmed)
      if (!shared) {
        errorMessage = 'Бит с таким кодом не найден.'
        return
      }
      const state = getState()
      saveBeats([...state.beats, { ...shared, id: `beat_${Date.now()}` }])
      joinCode = ''
    } catch (err) {
      errorMessage = 'Не удалось получить бит. ' + (err instanceof Error ? err.message : String(err))
    } finally {
      busy = false
      render()
    }
  }

  function kindBadge(kind: BeatKind) {
    return h('span', { className: 'badge' }, kind === 'beat' ? 'Бит' : 'Брейк')
  }

  function render() {
    const state = getState()
    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
        h(
          'div',
          { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
          h('h3', {}, 'Новый бит или брейк'),
          h('input', {
            className: 'input',
            placeholder: 'Название',
            value: newName,
            onInput: (e: Event) => (newName = (e.target as HTMLInputElement).value),
            onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleAdd(),
          }),
          h(
            'div',
            { style: { display: 'flex', gap: 'var(--space-2)' } },
            h(
              'select',
              {
                className: 'input',
                value: newKind,
                onChange: (e: Event) => (newKind = (e.target as HTMLSelectElement).value as BeatKind),
              },
              h('option', { value: 'beat' }, 'Бит'),
              h('option', { value: 'break' }, 'Брейк')
            ),
            h(
              'select',
              {
                className: 'input',
                value: String(newBars),
                onChange: (e: Event) => (newBars = Number((e.target as HTMLSelectElement).value)),
              },
              ...BEAT_BAR_OPTIONS.map((n) => h('option', { value: String(n) }, barsLabel(n)))
            )
          ),
          button('Создать', { variant: 'accent', onClick: handleAdd })
        ),
        state.beats.length === 0
          ? h('p', { style: { textAlign: 'center', color: 'var(--color-text-muted)' } }, 'Пока пусто — создайте первый бит выше')
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
              ...state.beats.map((beat) =>
                h(
                  'button',
                  { type: 'button', className: 'list-row', onClick: () => onOpenBeat(beat.id) },
                  icon('metronome'),
                  h('span', { style: { flex: '1', textAlign: 'left' } }, beat.name),
                  kindBadge(beat.kind),
                  h('span', { className: 'badge' }, barsLabel(beat.bars))
                )
              )
            ),
        isFirebaseConfigured
          ? h(
              'div',
              { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
              h('h3', {}, 'Добавить по коду'),
              h('p', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } },
                'Если кто-то поделился с вами битом — введите код, который он получил при нажатии «Поделиться».'),
              h('input', {
                className: 'input',
                placeholder: 'например, k7m2qx',
                value: joinCode,
                onInput: (e: Event) => (joinCode = (e.target as HTMLInputElement).value),
                onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && handleAddByCode(joinCode),
              }),
              button('Добавить', { onClick: () => handleAddByCode(joinCode), disabled: busy }),
              errorMessage ? h('div', { style: { color: 'var(--color-text-danger)' } }, errorMessage) : null
            )
          : null
      )
    )
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
