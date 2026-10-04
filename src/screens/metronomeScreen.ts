// Экран метронома: кольцо с долями/делением такта по кругу, BPM крупно в
// центре (тап — вписать вручную), степперы -10/-1/+1/+10 под кольцом.
// Паттерн и секции принадлежат песне — редактируются на экране песни,
// здесь их только проигрывает движок, если песня загружена. Темп и размер
// такта с загруженной песней — её (правка пишется в песню), без песни —
// метронома (appState.ts).
import { h, isRemounting, keepDigits, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { createBeatRing } from '../components/beatRing.ts'
import { CONFIG } from '../config.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { currentMeter, getState, subscribe, setBpm, setMeter, setVoiceCount } from '../state/appState.ts'

export function mountMetronomeScreen(container: HTMLElement, engine: AudioEngine): () => void {
  // Черновик ручного ввода BPM: null — не вводят. Хранится здесь, а не в
  // поле, — перерисовка посреди ввода (снимок Firestore) не стирает цифры.
  let bpmDraft: string | null = null
  let showMeterEditor = false

  function commitBpmDraft() {
    if (bpmDraft === null) return
    const value = bpmDraft
    bpmDraft = null
    // Пустое поле — оставить темп как был, а не уронить его до минимума.
    if (value.trim() === '') renderCenter()
    else setBpm(Number(value))
  }

  function renderBpm(): HTMLElement {
    if (bpmDraft === null) {
      return h(
        'button',
        { type: 'button', className: 'dial__bpm', onClick: () => { bpmDraft = String(getState().bpm); renderCenter(true) } },
        String(getState().bpm)
      )
    }
    return h('input', {
      type: 'text',
      className: 'dial__bpm-input',
      key: 'bpm-input',
      inputMode: 'numeric',
      autocomplete: 'off',
      'aria-label': `Темп, от ${CONFIG.MIN_BPM} до ${CONFIG.MAX_BPM}`,
      value: bpmDraft,
      onInput: (e: Event) => (bpmDraft = keepDigits(e.target as HTMLInputElement, 3)),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          bpmDraft = null
          renderCenter()
        }
      },
      // Не во время перерисовки: старое поле уходит из DOM, и недописанное
      // число («14» на пути к «140») не должно применяться (dom.ts).
      onChange: () => !isRemounting() && commitBpmDraft(),
      onBlur: () => !isRemounting() && commitBpmDraft(),
    })
  }

  function renderMeter(): HTMLElement {
    const meter = currentMeter()
    const meterButton = h(
      'button',
      { type: 'button', className: 'dial__meter', onClick: () => { showMeterEditor = !showMeterEditor; renderCenter() } },
      `${meter.beatsPerBar}/${meter.beatDivision}`
    )
    if (!showMeterEditor) return h('div', { className: 'dial__meter-anchor' }, meterButton)

    // Размер меняется через состояние (setMeter) — экран и кольцо
    // перерисуются по подписке, движок догонит в app.ts.
    const stepRow = (label: string, value: number, onChange: (v: number) => void) =>
      h(
        'div',
        { className: 'row row--3' },
        h('span', { className: 'grow text-small text-sub' }, label),
        iconButton('minus', { onClick: () => onChange(value - 1), ariaLabel: `${label}: меньше` }),
        h('span', { className: 'stepper-value' }, String(value)),
        iconButton('plus', { onClick: () => onChange(value + 1), ariaLabel: `${label}: больше` })
      )

    const editor = h(
      'div',
      { className: 'card stack dial__meter-editor' },
      stepRow('Долей в такте', meter.beatsPerBar, (v) => setMeter({ ...currentMeter(), beatsPerBar: v })),
      stepRow('Деление доли', meter.beatDivision, (v) => setMeter({ ...currentMeter(), beatDivision: v })),
      button('Готово', { variant: 'accent', onClick: () => { showMeterEditor = false; renderCenter() } })
    )
    return h('div', { className: 'dial__meter-anchor' }, meterButton, editor)
  }

  // Центр кольца перестраивается на каждое изменение (ввод BPM,
  // showMeterEditor, сами значения), а само кольцо (ring.element) —
  // персистентный узел, не пересоздаётся ради этого (см. render()).
  const centerEl = h('div', { className: 'dial__center' })
  const ring = createBeatRing(centerEl)

  function renderCenter(focusBpm = false) {
    mount(centerEl, renderBpm(), renderMeter())
    if (focusBpm) {
      const input = centerEl.querySelector<HTMLInputElement>('.dial__bpm-input')
      input?.focus()
      input?.select()
    }
  }

  function updateRing() {
    const playback = engine.playbackState
    const meter = currentMeter()
    ring.update({
      beat: playback.beat,
      subBeat: playback.subBeat,
      beatsPerBar: meter.beatsPerBar,
      beatDivision: meter.beatDivision,
      isPlaying: engine.isPlaying,
    })
  }

  // Каркас экрана — один раз, кольцо в нём не переезжает: перенос узла с
  // полем ввода в фокусе шлёт ему blur (Chrome — синхронно, посреди сборки
  // разметки), и недописанный BPM применялся бы. Перерисовываются центр
  // кольца (внутри mount) и галочка.
  const voiceCheckbox = h('input', {
    type: 'checkbox',
    onChange: (e: Event) => setVoiceCount((e.target as HTMLInputElement).checked),
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
          button(delta > 0 ? `+${delta}` : String(delta), { onClick: () => setBpm(getState().bpm + delta) })
        )
      ),
      h('label', { className: 'row checkbox-row' }, voiceCheckbox, h('span', {}, 'Считать вслух вместо клика'))
    )
  )

  function render() {
    renderCenter()
    voiceCheckbox.checked = getState().voiceCount
    updateRing()
  }

  // Горячий путь: подсветка и вспышка кольца обновляются напрямую из
  // движка на каждое событие, в обход полной перерисовки экрана — иначе
  // риск сбить аудио-тайминг лишней работой (тот же принцип, что в v1).
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
