// Редактор одного бита/брейка. Сама сетка и всё её поведение (тап, выделение
// прямоугольником, копии, вставка, заливка, добавление/удаление шагов и
// строк) — components/beatGrid.ts, повторяет редактор референса
// (realdrummetronome.com/editor). Здесь — всё вокруг сетки: кит, BPM,
// сохранение. Размер бита (beatsPerBar × beatDivision) не задаётся вручную —
// он пересчитывается по числу столбцов на каждое изменение длины
// (data/beatMeter.ts); выбирать приходится только при длине, кратной 12
// (переключатель над сеткой).
//
// Сетка — один живой элемент на весь экран: render() перерисовывает только
// блоки над и под ней, а ей передаёт свежий бит через grid.update() (иначе
// на каждый тап терялись бы прокрутка ленты и начатое выделение).
//
// Название не редактируется вживую — только через «Сохранить» (запрашивает
// имя и подтверждение), чтобы не держать на экране лишний постоянный ввод.
// Своей кнопки плей в редакторе нет — играть через общий транспорт в
// футере (app.ts), поэтому редактор держит движок в курсе: на каждое
// изменение бита резолвит его в обычный Pattern (resolveBeatPattern(),
// data/resolveBeat.ts) и грузит через engine.setSong() — иначе общий Play
// не знает про бит и просто щёлкает метрономом.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { createBeatGrid } from '../components/beatGrid.ts'
import { icon } from '../icons.ts'
import { CONFIG, DRUM_ROLES, DRUM_ROLE_LABELS, DRUM_KITS } from '../config.ts'
import { Beat, DrumRole } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, patchState, saveBeats } from '../state/appState.ts'
import { resolveBeatPattern } from '../data/resolveBeat.ts'
import { fitMeter, meterOptions, type BeatMeter } from '../data/beatMeter.ts'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function mountBeatEditorScreen(
  container: HTMLElement,
  beatId: string,
  engine: AudioEngine,
  onDone: () => void,
  onRegisterSave: (fn: () => void) => void
): () => void {
  let showAddRole = false
  let showSaveDialog = false
  let nameDraft = ''
  let showKitPicker = false
  let editingBpm = false
  let engineSynced = false

  function currentBeat(): Beat | undefined {
    return getState().beats.find((b) => b.id === beatId)
  }

  // Бит играет ровно свои beat.steps шагов и снова по кругу — поэтому БЕЗ
  // секций: у песни без секций нет длины, движок не «доходит до конца» и не
  // начинает заново, шаг просто идёт по модулю длины паттерна. С секцией
  // (было: bars = beatBarCount(beat)) круг обрывался на границе такта
  // движка (его доли × 2 шага, например 8), а не бита: 7 шагов играли как
  // 0123456 0123456 01 | 0123456 … См. tests/audioEngine.test.ts.
  function syncEngine(beat: Beat) {
    engine.setSong({
      id: -1,
      name: beat.name,
      bpm: getState().bpm,
      sections: [],
      pattern: resolveBeatPattern(beat),
    })
  }

  function updateBeat(patch: Partial<Beat>) {
    const state = getState()
    const updated = state.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b))
    saveBeats(updated)
    const beat = updated.find((b) => b.id === beatId)
    if (beat) syncEngine(beat)
  }

  // --- размер: выбор только при неоднозначной длине (кратной 12) ---
  function setMeter(meter: BeatMeter) {
    updateBeat(meter)
    render()
  }

  function renderMeterChoice(beat: Beat): HTMLElement | null {
    const options = meterOptions(beat.steps)
    if (options.length < 2) return null
    return h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } },
      h('span', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, 'Размер'),
      ...options.map((o) => {
        const active = o.beatsPerBar === beat.beatsPerBar && o.beatDivision === beat.beatDivision
        return h(
          'button',
          {
            type: 'button',
            // .dial__meter — тот же бейдж «N/M», что у кольца метронома.
            className: `dial__meter${active ? ' dial__meter--active' : ''}`,
            'aria-pressed': String(active),
            onClick: () => setMeter(o),
          },
          `${o.beatsPerBar}/${o.beatDivision}`
        )
      })
    )
  }

  // --- кит (звук) ---
  function setKit(kitId: string) {
    updateBeat({ kitId })
    render()
  }

  // Тот же id, что у дорожки в resolveBeatPattern() и в sampleLoader
  // (KIT_INSTRUMENTS, config.ts) — сэмпл роли в ките этого бита.
  function previewRole(role: DrumRole) {
    const beat = currentBeat()
    const kit = DRUM_KITS.find((k) => k.id === beat?.kitId) ?? DRUM_KITS[0]
    engine.previewSound(`${kit.id}_${role}`)
  }

  // --- глобальный BPM (тот же, что у метронома/футера) ---
  function updateBpm(next: number) {
    const clamped = clamp(Math.round(next), CONFIG.MIN_BPM, CONFIG.MAX_BPM)
    engine.setBpm(clamped)
    patchState({ bpm: clamped })
  }

  // --- строки-инструменты ---
  function addRole(role: DrumRole) {
    const beat = currentBeat()
    if (!beat) return
    showAddRole = false
    updateBeat({ tracks: [...beat.tracks, { role, steps: Array(beat.steps).fill(false) }] })
  }

  function removeRoleAt(index: number) {
    const beat = currentBeat()
    if (!beat) return
    updateBeat({ tracks: beat.tracks.filter((_, i) => i !== index) })
  }

  const grid = createBeatGrid({
    // Длина изменилась — размер пересчитывается сам (выбор для кратных 12
    // сохраняется, пока длина остаётся такой, где он допустим).
    onEdit: ({ steps, tracks }) => updateBeat({ steps, tracks, ...fitMeter(steps, currentBeat()) }),
    onAddRow: () => {
      showAddRole = !showAddRole
      render()
    },
    onRemoveRow: removeRoleAt,
    onPreviewRole: previewRole,
  })

  // --- сохранить (имя) ---
  function openSaveDialog() {
    nameDraft = currentBeat()?.name ?? ''
    showSaveDialog = true
    render()
  }

  function confirmSave() {
    updateBeat({ name: nameDraft.trim() || currentBeat()!.name })
    showSaveDialog = false
    onDone()
  }

  function renderSaveDialog(): HTMLElement {
    return h(
      'div',
      { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
      h('span', { style: { color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, 'Название бита'),
      h('input', {
        className: 'input',
        value: nameDraft,
        onInput: (e: Event) => (nameDraft = (e.target as HTMLInputElement).value),
        onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && confirmSave(),
      }),
      h(
        'div',
        { style: { display: 'flex', gap: 'var(--space-2)' } },
        button('Отмена', { onClick: () => { showSaveDialog = false; render() } }),
        button('Сохранить', { variant: 'accent', onClick: confirmSave })
      )
    )
  }

  // Выбор роли для новой строки — по «+» под иконками сетки.
  function renderAddRole(beat: Beat): HTMLElement {
    const availableRoles = DRUM_ROLES.filter((r) => !beat.tracks.some((t) => t.role === r))
    return h(
      'div',
      { className: 'card', style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' } },
      ...(availableRoles.length
        ? availableRoles.map((r) => button(DRUM_ROLE_LABELS[r], { onClick: () => addRole(r) }))
        : [h('span', { style: { color: 'var(--color-text-muted)' } }, 'Все инструменты уже добавлены')]),
      iconButton('x', { onClick: () => { showAddRole = false; render() }, ariaLabel: 'Закрыть' })
    )
  }

  // Sound/кит — своя роль→сэмпл раскладка (DRUM_KITS, config.ts), хранится
  // на самом бите (beat.kitId), не общая на приложение.
  function renderKitPicker(beat: Beat): HTMLElement {
    const kit = DRUM_KITS.find((k) => k.id === beat.kitId) ?? DRUM_KITS[0]
    const kitButton = h(
      'button',
      { type: 'button', className: 'list-row', onClick: () => { showKitPicker = !showKitPicker; render() } },
      h('span', { style: { color: 'var(--color-text-sub)' } }, 'Sound'),
      h('span', { style: { flex: '1', textAlign: 'right', fontWeight: 'var(--font-weight-bold)' } }, kit.name)
    )
    if (!showKitPicker) return kitButton
    return h(
      'div',
      {},
      kitButton,
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' } },
        ...DRUM_KITS.map((k) =>
          h(
            'button',
            { type: 'button', className: 'list-row', onClick: () => { setKit(k.id); showKitPicker = false; render() } },
            h('span', { style: { flex: '1', textAlign: 'left' } }, k.name),
            k.id === beat.kitId ? icon('check-circle') : null
          )
        )
      )
    )
  }

  // BPM — общий с метрономом/футером; тап — вписать вручную, как в
  // metronomeScreen.ts. Играть — кнопкой в футере.
  function renderBpm(): HTMLElement {
    const bpm = getState().bpm
    const bpmEl: HTMLElement = editingBpm
      ? (() => {
          const input = h('input', {
            type: 'number',
            className: 'input',
            style: { width: '84px', fontSize: 'var(--font-size-h2)', fontWeight: 'var(--font-weight-bold)', textAlign: 'center' },
            value: String(bpm),
            min: String(CONFIG.MIN_BPM),
            max: String(CONFIG.MAX_BPM),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { editingBpm = false; render() }
            },
            onChange: (e: Event) => {
              updateBpm(Number((e.target as HTMLInputElement).value))
              editingBpm = false
              render()
            },
          })
          queueMicrotask(() => { input.focus(); input.select() })
          return input
        })()
      : h(
          'button',
          {
            type: 'button',
            style: {
              background: 'none',
              border: 'none',
              fontSize: 'var(--font-size-h2)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              minWidth: '64px',
              minHeight: 'var(--touch-target-min)',
            },
            onClick: () => { editingBpm = true; render() },
          },
          String(bpm)
        )

    return h('div', { className: 'card', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } }, bpmEl)
  }

  const aboveGrid = h('div', {})
  const belowGrid = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } })
  const layout = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } }, aboveGrid, grid.el, belowGrid)

  function render() {
    const beat = currentBeat()
    if (!beat) {
      mount(container, h('p', {}, 'Бит не найден.'))
      return
    }
    if (!layout.isConnected) mount(container, layout)
    // Бит мог прийти из БД позже открытия экрана (обновили страницу в
    // редакторе) — отдать его движку при первом появлении.
    if (!engineSynced) {
      engineSynced = true
      syncEngine(beat)
    }
    mount(aboveGrid, renderMeterChoice(beat))
    aboveGrid.hidden = !aboveGrid.firstChild
    grid.update(beat)
    mount(
      belowGrid,
      showAddRole ? renderAddRole(beat) : null,
      showSaveDialog ? renderSaveDialog() : null,
      renderKitPicker(beat),
      renderBpm()
    )
  }


  // Играющий шаг подсвечивается напрямую в DOM сетки (grid.setPlayhead), в
  // обход перерисовки — как и в patternScreen.ts. engine.onPlaybackState —
  // единственный слот, но горячий путь занят ровно одним смонтированным
  // экраном одновременно (как в metronomeScreen.ts/patternScreen.ts);
  // engine.onPlayingChange занят футером в app.ts, поэтому старт игры
  // (прокрутить ленту к началу, как у референса) ловим здесь же.
  let wasPlaying = engine.isPlaying
  engine.onPlaybackState((playback) => {
    if (engine.isPlaying !== wasPlaying) {
      wasPlaying = engine.isPlaying
      if (wasPlaying) grid.scrollToStart()
    }
    // Пустой бит движок играет щелчком, а не паттерном — patternStep там
    // всегда 0, подсвечивать нечего.
    const hasNotes = !!currentBeat()?.tracks.some((t) => t.steps.some(Boolean))
    grid.setPlayhead(engine.isPlaying && hasNotes ? playback.patternStep : null)
  })

  onRegisterSave(openSaveDialog)

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    grid.destroy()
  }
}
