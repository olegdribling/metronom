// Экран библиотеки битов/брейков: список + создание. Биты хранятся в
// аккаунте (users/{uid}/beats, data/userLibrary.ts) — без входа экран
// показывает карточку «Войти через Google». Сам редактор — beatEditorScreen.ts.
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { icon } from '../icons.ts'
import { CONFIG, DEFAULT_KIT_ID } from '../config.ts'
import { Beat, BeatKind } from '../types.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'

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
    bpm: CONFIG.DEFAULT_BPM,
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
        { className: 'stack stack--4' },
        button('Создать', { variant: 'accent', onClick: handleCreate }),
        state.beats.length === 0
          ? h('p', { className: 'text-center text-muted' }, state.beatsLoaded ? 'Пока пусто — создайте первый бит выше' : 'Загрузка…')
          : h(
              'div',
              { className: 'stack stack--2' },
              ...state.beats.map((beat) =>
                h(
                  'button',
                  { type: 'button', className: 'list-row', onClick: () => onOpenBeat(beat.id) },
                  icon('drum'),
                  h('span', { className: 'grow' }, beat.name),
                  kindBadge(beat.kind),
                  // Бит — один такт своего размера (data/beatMeter.ts); тот же
                  // бейдж «N/M», что в выборе филла на экране песни.
                  h('span', { className: 'badge' }, `${beat.beatsPerBar}/${beat.beatDivision}`)
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
