// Экран метронома: кольцо с долями/делением такта по кругу, BPM крупно в
// центре (тап — вписать вручную), степперы -10/-1/+1/+10 под кольцом.
// Паттерн и секции принадлежат песне — редактируются на экране песни,
// здесь их только проигрывает движок, если песня загружена.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { createBeatRing } from '../components/beatRing.ts'
import { CONFIG } from '../config.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, patchState, saveSongs, setVoiceCount } from '../state/appState.ts'

const MIN_BEATS_PER_BAR = 1
const MAX_BEATS_PER_BAR = 16
const MIN_BEAT_DIVISION = 1
const MAX_BEAT_DIVISION = 8

const clampBpm = (value: number): number =>
  Math.min(CONFIG.MAX_BPM, Math.max(CONFIG.MIN_BPM, Math.round(value)))
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function mountMetronomeScreen(container: HTMLElement, engine: AudioEngine): () => void {
  let editingBpm = false
  let showMeterEditor = false

  function updateBpm(next: number) {
    const clamped = clampBpm(next)
    engine.setBpm(clamped)
    patchState({ bpm: clamped })

    const state = getState()
    const song = state.songs.find((s) => s.id === state.currentSongId)
    if (song && song.bpm !== clamped) {
      saveSongs(state.songs.map((s) => (s.id === state.currentSongId ? { ...s, bpm: clamped } : s)))
    }
  }

  function renderBpm(): HTMLElement {
    if (!editingBpm) {
      return h(
        'button',
        { type: 'button', className: 'dial__bpm', onClick: () => { editingBpm = true; renderCenter() } },
        String(getState().bpm)
      )
    }
    const input = h('input', {
      type: 'number',
      className: 'dial__bpm-input',
      value: String(getState().bpm),
      min: String(CONFIG.MIN_BPM),
      max: String(CONFIG.MAX_BPM),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          editingBpm = false
          renderCenter()
        }
      },
      onChange: (e: Event) => {
        updateBpm(Number((e.target as HTMLInputElement).value))
        editingBpm = false
        renderCenter()
      },
    })
    // Автофокус и выделение содержимого сразу после вставки в DOM — можно
    // сразу перепечатать число, не нажимая отдельно на поле.
    queueMicrotask(() => {
      input.focus()
      input.select()
    })
    return input
  }

  function renderMeter(): HTMLElement {
    const meterButton = h(
      'button',
      {
        type: 'button',
        className: 'dial__meter',
        onClick: () => { showMeterEditor = !showMeterEditor; renderCenter() },
      },
      `${engine.beatsPerBar}/${engine.beatDivision}`
    )
    if (!showMeterEditor) {
      return h('div', { style: { position: 'relative' } }, meterButton)
    }

    // render(), не renderCenter(): эти степперы меняют геометрию самого
    // кольца (число точек), а не только текст в центре — кольцо должно
    // перестроиться сразу, не дожидаясь следующего события воспроизведения.
    const stepRow = (label: string, value: number, onChange: (v: number) => void, min: number, max: number) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        h('span', { style: { flex: '1', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, label),
        iconButton('minus', { onClick: () => { onChange(clamp(value - 1, min, max)); render() }, ariaLabel: `${label}: меньше` }),
        h('span', { style: { minWidth: '24px', textAlign: 'center', fontWeight: 'var(--font-weight-bold)' } }, String(value)),
        iconButton('plus', { onClick: () => { onChange(clamp(value + 1, min, max)); render() }, ariaLabel: `${label}: больше` })
      )

    const editor = h(
      'div',
      {
        className: 'card',
        style: {
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 'var(--space-2)',
          width: '220px',
          zIndex: '10',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        },
      },
      stepRow('Долей в такте', engine.beatsPerBar, (v) => engine.setBeatsPerBar(v), MIN_BEATS_PER_BAR, MAX_BEATS_PER_BAR),
      stepRow('Деление доли', engine.beatDivision, (v) => engine.setBeatDivision(v), MIN_BEAT_DIVISION, MAX_BEAT_DIVISION),
      button('Готово', { variant: 'accent', onClick: () => { showMeterEditor = false; renderCenter() } })
    )
    return h('div', { style: { position: 'relative' } }, meterButton, editor)
  }

  // Центр кольца перестраивается на каждое изменение (editingBpm,
  // showMeterEditor, сами значения), а само кольцо (ring.element) —
  // персистентный узел, не пересоздаётся ради этого (см. render()).
  const centerEl = h('div', { className: 'dial__center' })
  const ring = createBeatRing(centerEl)

  function renderCenter() {
    mount(centerEl, renderBpm(), renderMeter())
  }

  function render() {
    const state = getState()
    renderCenter()
    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-6)' } },
        ring.element,
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', width: '100%', maxWidth: '320px' } },
          ...[-10, -1, 1, 10].map((delta) =>
            button(delta > 0 ? `+${delta}` : String(delta), { onClick: () => updateBpm(state.bpm + delta) })
          )
        ),
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: state.voiceCount,
            onChange: (e: Event) => {
              const checked = (e.target as HTMLInputElement).checked
              engine.setVoiceCount(checked)
              setVoiceCount(checked)
            },
          }),
          h('span', {}, 'Считать вслух вместо клика')
        )
      )
    )
    ring.update({
      beat: state.playbackState.beat,
      subBeat: state.playbackState.subBeat,
      beatsPerBar: engine.beatsPerBar,
      beatDivision: engine.beatDivision,
      isPlaying: engine.isPlaying,
    })
  }

  // Горячий путь: подсветка и вспышка кольца обновляются напрямую из
  // движка на каждое событие, в обход полной перерисовки экрана — иначе
  // риск сбить аудио-тайминг лишней работой (тот же принцип, что в v1).
  engine.onPlaybackState((playback) => {
    ring.update({
      beat: playback.beat,
      subBeat: playback.subBeat,
      beatsPerBar: engine.beatsPerBar,
      beatDivision: engine.beatDivision,
      isPlaying: engine.isPlaying,
    })
    if (engine.isPlaying) ring.flash()
  })

  const unsubscribe = subscribe(render)
  render()

  return () => unsubscribe()
}
