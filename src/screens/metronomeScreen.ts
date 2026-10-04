// Экран метронома: кольцо с долями/делением такта по кругу, BPM крупно в
// центре (тап — вписать вручную), степперы -10/-1/+1/+10 под кольцом.
// Настройки — только метронома (state.metronome): темп, размер, голос, ни на
// что не влияют и запоминаются; у песен и битов всё своё (решение
// пользователя). Темп здесь — скорость каждой точки кольца, крупной и
// мелкой: 120 — удар раз в 0,5 с (движку app.ts отдаёт BPM доли — делённый
// на деление доли, data/engineSettings.ts).
import { h, mount } from '../dom.ts'
import { button } from '../components/button.ts'
import { createBeatRing } from '../components/beatRing.ts'
import { createMeterField, createTempoField } from '../components/tempoControls.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, setMetronome } from '../state/appState.ts'

export function mountMetronomeScreen(container: HTMLElement, engine: AudioEngine): () => void {
  const metronome = () => getState().metronome

  // Центр кольца перестраивается на каждое изменение (ввод BPM, панель
  // размера, сами значения), а само кольцо (ring.element) — персистентный
  // узел, не пересоздаётся ради этого.
  const centerEl = h('div', { className: 'dial__center' })
  const ring = createBeatRing(centerEl)
  const renderCenter = () => mount(centerEl, tempo.render(), meter.render())

  const tempo = createTempoField({
    key: 'metronome-bpm',
    get: () => metronome().bpm,
    set: (bpm) => setMetronome({ bpm }),
    rerender: renderCenter,
    buttonClass: 'dial__bpm',
    inputClass: 'dial__bpm-input',
  })
  const meter = createMeterField({
    get: () => metronome(),
    set: (m) => setMetronome(m),
    rerender: renderCenter,
  })

  function updateRing() {
    const playback = engine.playbackState
    const m = metronome()
    ring.update({
      beat: playback.beat,
      subBeat: playback.subBeat,
      beatsPerBar: m.beatsPerBar,
      beatDivision: m.beatDivision,
      isPlaying: engine.isPlaying,
    })
  }

  // Каркас экрана — один раз, кольцо в нём не переезжает: перенос узла с
  // полем ввода в фокусе шлёт ему blur (Chrome — синхронно, посреди сборки
  // разметки), и недописанный BPM применялся бы. Перерисовываются центр
  // кольца (внутри mount) и галочка.
  const voiceCheckbox = h('input', {
    type: 'checkbox',
    onChange: (e: Event) => setMetronome({ voiceCount: (e.target as HTMLInputElement).checked }),
  })
  mount(
    container,
    h(
      'div',
      { className: 'stack stack--6 metronome' },
      ring.element,
      h(
        'div',
        { className: 'metronome__steppers' },
        ...[-10, -1, 1, 10].map((delta) =>
          button(delta > 0 ? `+${delta}` : String(delta), { onClick: () => setMetronome({ bpm: metronome().bpm + delta }) })
        )
      ),
      h('label', { className: 'row checkbox-row' }, voiceCheckbox, h('span', {}, 'Считать вслух вместо клика'))
    )
  )

  function render() {
    renderCenter()
    voiceCheckbox.checked = metronome().voiceCount
    updateRing()
  }

  // Горячий путь: подсветка и вспышка кольца обновляются напрямую из
  // движка на каждое событие (каждая точка — удар), в обход полной
  // перерисовки экрана — иначе риск сбить аудио-тайминг лишней работой.
  const releasePlayback = engine.onPlaybackState(() => {
    updateRing()
    if (engine.isPlaying) ring.flash()
  })

  const unsubscribe = subscribe(render)
  render()

  return () => {
    unsubscribe()
    releasePlayback()
  }
}
