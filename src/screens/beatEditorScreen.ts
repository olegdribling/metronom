// Редактор бита — один на весь сервис (решение пользователя): бит/брейк из
// библиотеки «Биты» и паттерн песни (BeatEditorTarget ниже). Сама сетка и всё её поведение (тап, выделение
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
// У паттерна песни имени нет — нет и «Сохранить». Своей кнопки плей в
// редакторе нет — играть через общий транспорт в футере: на этой странице он
// играет бит по кругу (app.ts берёт его из состояния — каждая правка сразу
// слышна) в его темпе: у бита свой (beat.bpm), у паттерна — темп песни.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { createBeatGrid } from '../components/beatGrid.ts'
import { accountGate } from '../components/signInCard.ts'
import { createTempoField } from '../components/tempoControls.ts'
import { icon } from '../icons.ts'
import { CONFIG, DRUM_ROLES, DRUM_ROLE_LABELS, DRUM_KITS } from '../config.ts'
import { Beat, DrumRole, Song } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, saveBeats, saveSongs } from '../state/appState.ts'
import { clampBpm } from '../data/songs.ts'
import { fitMeter, meterOptions, type BeatMeter } from '../data/beatMeter.ts'

// Что правит редактор: бит из библиотеки или паттерн песни (бит внутри
// песни, Song.pattern). Редактор на весь сервис один (решение
// пользователя) — разница только здесь.
export interface BeatEditorTarget {
  get(): Beat | undefined
  save(beat: Beat): void
  /** Данные уже пришли — до этого «Загрузка…», а не «не найден». */
  loaded(): boolean
  notFoundText: string
  gateText: string
  tempo: { get(): number; set(bpm: number): void }
}

// Бит из библиотеки «Биты»: свой темп, название — через «Сохранить».
export function libraryBeatTarget(beatId: string): BeatEditorTarget {
  const get = () => getState().beats.find((b) => b.id === beatId)
  const save = (beat: Beat) => saveBeats(getState().beats.map((b) => (b.id === beatId ? beat : b)))
  return {
    get,
    save,
    loaded: () => getState().beatsLoaded,
    notFoundText: 'Бит не найден.',
    gateText: 'Войдите — биты хранятся в вашем аккаунте и видны на любом устройстве.',
    tempo: {
      get: () => get()?.bpm ?? CONFIG.DEFAULT_BPM,
      set: (bpm) => {
        const beat = get()
        if (beat) save({ ...beat, bpm: clampBpm(bpm) })
      },
    },
  }
}

// Паттерн песни: темп — песни (правка меняет темп песни), имени нет.
export function songPatternTarget(songId: number): BeatEditorTarget {
  const song = () => getState().songs.find((s) => s.id === songId)
  const update = (patch: Partial<Song>) => saveSongs(getState().songs.map((s) => (s.id === songId ? { ...s, ...patch } : s)))
  return {
    get: () => song()?.pattern,
    save: (pattern) => update({ pattern }),
    loaded: () => getState().songsLoaded,
    notFoundText: 'Песня не найдена.',
    gateText: 'Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.',
    tempo: {
      get: () => song()?.bpm ?? CONFIG.DEFAULT_BPM,
      set: (bpm) => update({ bpm: clampBpm(bpm) }),
    },
  }
}

export function mountBeatEditorScreen(
  container: HTMLElement,
  target: BeatEditorTarget,
  engine: AudioEngine,
  /** «Сохранить» с названием — только у бита библиотеки; у паттерна песни
   * имени нет, дискеты в шапке тоже (app.ts). */
  saving: { onDone: () => void; onRegisterSave: (fn: () => void) => void } | null
): () => void {
  let showAddRole = false
  let showSaveDialog = false
  let nameDraft = ''
  let showKitPicker = false

  const currentBeat = () => target.get()

  // Сохранение перерисует экран по подписке, а app.ts отдаст новую версию
  // движку.
  function updateBeat(patch: Partial<Beat>) {
    const beat = currentBeat()
    if (beat) target.save({ ...beat, ...patch })
  }

  // --- размер: выбор только при неоднозначной длине (кратной 12) ---
  function setMeter(meter: BeatMeter) {
    updateBeat(meter)
  }

  function renderMeterChoice(beat: Beat): HTMLElement | null {
    const options = meterOptions(beat.steps)
    if (options.length < 2) return null
    return h(
      'div',
      { className: 'row' },
      h('span', { className: 'text-sub text-small' }, 'Размер'),
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
  }

  // Тот же id, что у дорожки в resolveBeatPattern() и в sampleLoader
  // (KIT_INSTRUMENTS, config.ts) — сэмпл роли в ките этого бита.
  function previewRole(role: DrumRole) {
    const beat = currentBeat()
    const kit = DRUM_KITS.find((k) => k.id === beat?.kitId) ?? DRUM_KITS[0]
    engine.previewSound(`${kit.id}_${role}`)
  }

  // --- темп бита: свой у каждого бита, сохраняется в нём ---
  const tempo = createTempoField({
    key: 'beat-bpm',
    get: target.tempo.get,
    set: target.tempo.set,
    rerender: () => render(),
    buttonClass: 'tempo-button',
    inputClass: 'input tempo-input',
  })

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
    const beat = currentBeat()
    showSaveDialog = false
    if (beat) updateBeat({ name: nameDraft.trim().slice(0, CONFIG.MAX_NAME_LENGTH) || beat.name })
    saving?.onDone()
  }

  function renderSaveDialog(): HTMLElement {
    return h(
      'div',
      { className: 'card stack' },
      h('span', { className: 'text-sub text-small' }, 'Название бита'),
      h('input', {
        className: 'input',
        key: 'beat-name',
        maxLength: String(CONFIG.MAX_NAME_LENGTH),
        value: nameDraft,
        onInput: (e: Event) => (nameDraft = (e.target as HTMLInputElement).value),
        onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && confirmSave(),
      }),
      h(
        'div',
        { className: 'row' },
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
      { className: 'card row row--wrap' },
      ...(availableRoles.length
        ? availableRoles.map((r) => button(DRUM_ROLE_LABELS[r], { onClick: () => addRole(r) }))
        : [h('span', { className: 'text-muted' }, 'Все инструменты уже добавлены')]),
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
      h('span', { className: 'text-sub' }, 'Sound'),
      h('span', { className: 'grow text-right text-bold' }, kit.name)
    )
    if (!showKitPicker) return kitButton
    return h(
      'div',
      {},
      kitButton,
      h(
        'div',
        { className: 'card stack stack--2 mt-2' },
        ...DRUM_KITS.map((k) =>
          h(
            'button',
            { type: 'button', className: 'list-row', onClick: () => { showKitPicker = false; setKit(k.id) } },
            h('span', { className: 'grow' }, k.name),
            k.id === beat.kitId ? icon('check-circle') : null
          )
        )
      )
    )
  }

  // Темп бита; тап — вписать вручную, как на метрономе. Играть — кнопкой в
  // футере.
  function renderBpm(): HTMLElement {
    return h('div', { className: 'card row row--center' }, tempo.render(), h('span', { className: 'text-small text-sub' }, 'BPM'))
  }

  const aboveGrid = h('div', {})
  const belowGrid = h('div', { className: 'stack stack--4' })
  const layout = h('div', { className: 'stack stack--4' }, aboveGrid, grid.el, belowGrid)

  function render() {
    const gate = accountGate(target.gateText)
    const beat = currentBeat()
    if (gate || !beat) {
      mount(
        container,
        gate ?? (target.loaded() ? h('p', {}, target.notFoundText) : h('p', { className: 'text-center text-muted' }, 'Загрузка…'))
      )
      return
    }
    if (!layout.isConnected) mount(container, layout)
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
  // обход перерисовки. engine.onPlaybackState —
  // единственный слот, но горячий путь занят ровно одним смонтированным
  // экраном одновременно (как в metronomeScreen.ts/songScreen.ts);
  // engine.onPlayingChange занят футером в app.ts, поэтому старт игры
  // (прокрутить ленту к началу, как у референса) ловим здесь же.
  let wasPlaying = engine.isPlaying
  const releasePlayback = engine.onPlaybackState((playback) => {
    if (engine.isPlaying !== wasPlaying) {
      wasPlaying = engine.isPlaying
      if (wasPlaying) grid.scrollToStart()
    }
    // Пустой бит движок играет щелчком, а не паттерном — шага там нет (-1).
    grid.setPlayhead(engine.isPlaying && playback.patternStep >= 0 ? playback.patternStep : null)
  })

  saving?.onRegisterSave(openSaveDialog)

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    releasePlayback()
    grid.destroy()
  }
}
