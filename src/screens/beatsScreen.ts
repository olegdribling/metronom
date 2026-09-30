// Экран библиотеки битов/брейков: список (локальный, без Firestore, см.
// data/beatsLibrary.ts) + создание + добавление чужого бита по коду (разовая
// передача, см. data/sharedBeatApi.ts). Сам редактор — beatEditorScreen.ts.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { icon } from '../icons.ts'
import { DEFAULT_KIT_ID } from '../config.ts'
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

// 1 такт — «+» справа от сетки в редакторе добавляет ещё один такт такого
// же размера, не нужно начинать с нескольких сразу.
const DEFAULT_BARS = 1
const DEFAULT_BEATS_PER_BAR = 1
const DEFAULT_BEAT_DIVISION = 4
// Сразу с тремя дорожками — самый частый стартовый набор, не заставляем
// добавлять их вручную при каждом новом бите.
const DEFAULT_ROLES: Beat['tracks'][number]['role'][] = ['hihat', 'snare', 'kick']

function createDefaultBeat(): Beat {
  const totalSteps = DEFAULT_BARS * DEFAULT_BEATS_PER_BAR * DEFAULT_BEAT_DIVISION
  return {
    id: `beat_${Date.now()}`,
    kind: 'beat',
    name: 'Новый бит',
    bars: DEFAULT_BARS,
    beatsPerBar: DEFAULT_BEATS_PER_BAR,
    beatDivision: DEFAULT_BEAT_DIVISION,
    kitId: DEFAULT_KIT_ID,
    tracks: DEFAULT_ROLES.map((role) => ({ role, steps: Array(totalSteps).fill(false) })),
  }
}

export function mountBeatsScreen(container: HTMLElement, onOpenBeat: (beatId: string) => void): () => void {
  let joinCode = ''
  let busy = false
  let errorMessage: string | null = null

  function handleCreate() {
    const beat = createDefaultBeat()
    const state = getState()
    saveBeats([...state.beats, beat])
    onOpenBeat(beat.id)
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
        button('Создать', { variant: 'accent', onClick: handleCreate }),
        state.beats.length === 0
          ? h('p', { style: { textAlign: 'center', color: 'var(--color-text-muted)' } }, 'Пока пусто — создайте первый бит выше')
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
              ...state.beats.map((beat) =>
                h(
                  'button',
                  { type: 'button', className: 'list-row', onClick: () => onOpenBeat(beat.id) },
                  icon('drum'),
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
