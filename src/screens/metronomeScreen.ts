// Экран метронома: кольцо с долями/делением такта по кругу (почти во всю
// ширину, по центру свободного места), BPM крупно в центре (тап — вписать
// вручную); внизу, над футером, — степперы -10/-1/+1/+10, «Считать вслух» и
// «Включить мигание» (выключено — по точкам ходит стрелка).
// Настройки — только метронома (state.metronome): темп, размер, голос, ни на
// что не влияют и запоминаются; у песен и битов всё своё (решение
// пользователя). Темп здесь — скорость каждой точки кольца, крупной и
// мелкой: 120 — удар раз в 0,5 с (движку app.ts отдаёт BPM доли — делённый
// на деление доли, data/engineSettings.ts).
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { createBeatRing } from '../components/beatRing.ts'
import { createMeterField, createTempoField } from '../components/tempoControls.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, setMetronome } from '../state/appState.ts'

export function mountMetronomeScreen(container: HTMLElement, engine: AudioEngine, onEditPattern: () => void): () => void {
  const metronome = () => getState().metronome
  // «Свой паттерн» включён и есть: играет он вместо щелчка, а скорость,
  // размер и кольцо — метронома (data/engineSettings.ts).
  const meterNow = () => metronome()
  const patternActive = () => metronome().usePattern && !!getState().metronomePattern

  // Центр кольца перестраивается на каждое изменение (ввод BPM, панель
  // размера, сами значения), а само кольцо (ring.element) — персистентный
  // узел, не пересоздаётся ради этого.
  const centerEl = h('div', { className: 'dial__center' })
  const ring = createBeatRing(centerEl)
  // С паттерном бейдж размера неактивен — только показывает (решение
  // пользователя).
  const renderCenter = () =>
    mount(
      centerEl,
      tempo.render(),
      patternActive()
        ? h('div', { className: 'dial__meter-anchor' }, h('span', { className: 'dial__meter dial__meter--fixed' }, `${meterNow().beatsPerBar}/${meterNow().beatDivision}`))
        : meter.render()
    )

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
    const m = meterNow()
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
  const patternCheckbox = h('input', {
    type: 'checkbox',
    onChange: (e: Event) => setMetronome({ usePattern: (e.target as HTMLInputElement).checked }),
  })
  const flashCheckbox = h('input', {
    type: 'checkbox',
    onChange: (e: Event) => setMetronome({ flash: (e.target as HTMLInputElement).checked }),
  })
  mount(
    container,
    h(
      'div',
      { className: 'metronome' },
      h('div', { className: 'metronome__dial-area' }, ring.element),
      h(
        'div',
        { className: 'stack metronome__controls' },
        h(
          'div',
          { className: 'metronome__steppers' },
          ...[-10, -1, 1, 10].map((delta) =>
            button(delta > 0 ? `+${delta}` : String(delta), { onClick: () => setMetronome({ bpm: metronome().bpm + delta }) })
          )
        ),
        h('label', { className: 'row checkbox-row' }, voiceCheckbox, h('span', {}, 'Считать вслух вместо клика')),
        h('label', { className: 'row checkbox-row' }, flashCheckbox, h('span', {}, 'Включить мигание')),
        // «Свой паттерн» (решение пользователя): галочка — играть его вместо
        // щелчка, карандаш — редактор (/metronome/pattern).
        h(
          'div',
          { className: 'row' },
          h('label', { className: 'row checkbox-row' }, patternCheckbox, h('span', {}, 'Свой паттерн')),
          iconButton('pencil-simple', { onClick: onEditPattern, ariaLabel: 'Редактировать свой паттерн' })
        )
      )
    )
  )

  function render() {
    const m = metronome()
    renderCenter()
    voiceCheckbox.checked = m.voiceCount
    flashCheckbox.checked = m.flash
    patternCheckbox.checked = m.usePattern
    ring.setHandMode(!m.flash)
    updateRing()
  }

  // Горячий путь: подсветка и вспышка кольца обновляются напрямую из
  // движка на каждое событие (каждая точка — удар), в обход полной
  // перерисовки экрана — иначе риск сбить аудио-тайминг лишней работой.
  // Вспышка — только на точку кольца (новая доля или деление), не на шаг
  // своего паттерна внутри доли.
  let lastPoint = ''
  const releasePlayback = engine.onPlaybackState((playback) => {
    const point = `${playback.bar}:${playback.beat}:${playback.subBeat}`
    if (point === lastPoint) return
    lastPoint = point
    updateRing()
    if (engine.isPlaying && metronome().flash) ring.flash()
  })

  const unsubscribe = subscribe(render)
  render()

  return () => {
    unsubscribe()
    releasePlayback()
  }
}
