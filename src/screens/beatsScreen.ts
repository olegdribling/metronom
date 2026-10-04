// Экран библиотеки битов/брейков: список + создание. Биты хранятся в
// аккаунте (users/{uid}/beats, data/userLibrary.ts) — без входа экран
// показывает карточку «Войти через Google». Сам редактор — beatEditorScreen.ts.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { icon } from '../icons.ts'
import { DEFAULT_KIT_ID } from '../config.ts'
import { Beat, BeatKind } from '../types.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'
import { beatBarCount } from '../data/beatsLibrary.ts'

function barsLabel(n: number): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod10 === 1 && mod100 !== 11) return `${n} такт`
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} такта`
  return `${n} тактов`
}

// Один такт размера 1/4 — дальше длина наращивается в редакторе по одному
// столбцу («+» справа от сетки или тап по призрачному столбцу за концом).
const DEFAULT_BEATS_PER_BAR = 1
const DEFAULT_BEAT_DIVISION = 4
// Сразу с тремя дорожками — самый частый стартовый набор, не заставляем
// добавлять их вручную при каждом новом бите.
const DEFAULT_ROLES: Beat['tracks'][number]['role'][] = ['hihat', 'snare', 'kick']

function createDefaultBeat(): Beat {
  const totalSteps = DEFAULT_BEATS_PER_BAR * DEFAULT_BEAT_DIVISION
  return {
    id: `beat_${Date.now()}`,
    kind: 'beat',
    name: 'Новый бит',
    steps: totalSteps,
    beatsPerBar: DEFAULT_BEATS_PER_BAR,
    beatDivision: DEFAULT_BEAT_DIVISION,
    kitId: DEFAULT_KIT_ID,
    tracks: DEFAULT_ROLES.map((role) => ({ role, steps: Array(totalSteps).fill(false) })),
  }
}

export function mountBeatsScreen(container: HTMLElement, onOpenBeat: (beatId: string) => void): () => void {
  function handleCreate() {
    const beat = createDefaultBeat()
    const state = getState()
    saveBeats([...state.beats, beat])
    onOpenBeat(beat.id)
  }

  function kindBadge(kind: BeatKind) {
    return h('span', { className: 'badge' }, kind === 'beat' ? 'Бит' : 'Брейк')
  }

  function render() {
    const gate = accountGate('Войдите — биты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) {
      mount(container, gate)
      return
    }
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
                  h('span', { className: 'badge' }, barsLabel(beatBarCount(beat)))
                )
              )
            )
      )
    )
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
