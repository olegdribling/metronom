// Экран песни: строка темпа и размера такта песни (свои у каждой песни, на
// метроном и биты не влияют — решение пользователя; BPM — доли), секции
// (порядок, такты, комментарий), «Редактор паттерна» — паттерн песни в том
// же редакторе бита (/song/:id/pattern). Одна песня
// внутри плейлиста — Song из state.songs. Play в футере на этой странице
// играет эту песню (app.ts).
//
// В каждой секции — сетка долей (.bar-grid), как в v1 (SectionCard.tsx):
// квадратик на долю, по долям такта песни (её размер, data/songs.ts) на
// такт. Во время игры прошедшие доли закрашены, текущая выделена, карточка
// текущей секции — .card--active, и экран сам доезжает до неё. Это горячий
// путь: обновляется напрямую в DOM из engine.onPlaybackState, в обход
// перерисовки экрана (как подсветка доли в metronomeScreen.ts и шага в
// редакторе бита).
//
// Биты из библиотеки в секциях: в форме секции — «Бит секции» (грув на всю
// секцию вместо паттерна песни), тап по квадратику-доле — филл с этой доли
// (бит на N/M занимает N долей, доли под ним отмечены). В песне хранятся
// только ссылки (beatId), паттерны подставляет app.ts для движка.
//
// Секции везде — по id, не по индексу: индексы сдвигаются при удалении,
// перетаскивании и правке с другого устройства, и открытая форма правки
// иначе сохранялась бы в соседнюю секцию.
import { h, keepDigits, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { accountGate } from '../components/signInCard.ts'
import { createMeterField, createTempoField } from '../components/tempoControls.ts'
import { icon } from '../icons.ts'
import { CONFIG, SECTION_TYPES } from '../config.ts'
import { Beat, PlaybackState, Section, SectionFormData, Song } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, saveSongs, saveBeats } from '../state/appState.ts'
import {
  beatLengthInBeats,
  clampBars,
  clampBpm,
  newSectionId,
  pruneFills,
  sectionBeatCount,
  sliceForBeat,
  songMeter,
  squareContent,
  withSongMeter,
} from '../data/songs.ts'

const emptySectionForm = (): SectionFormData => ({ name: 'VERSE', bars: 4, comment: '' })

export interface SongScreenOptions {
  onOpenPattern: () => void
  /** «Редактировать» в выборе филла — открыть бит в редакторе (из песни). */
  onEditBeat: (beatId: string, sectionId: string) => void
  /** Вернулись из редактора бита — доехать до этой секции. */
  focusSectionId: string | null
}

export function mountSongScreen(container: HTMLElement, songId: number, engine: AudioEngine, opts: SongScreenOptions): () => void {
  let showAddForm = false
  let newSection = emptySectionForm()
  let editingId: string | null = null
  let editData = emptySectionForm()
  let dragFrom: number | null = null
  // Квадратики долей текущей отрисовки: data-beat — номер доли от начала
  // песни (такт × долей в такте + доля), его же считает движок.
  let beatCells: HTMLElement[] = []
  let sectionCards: HTMLElement[] = []
  let shownBeat = -1
  let shownSection = -1
  let lastPlayback: PlaybackState = engine.playbackState
  // Открытое меню квадратика: секция, доля (от начала секции, с 0) и открыт
  // ли в нём список битов («Из списка»).
  let fillPicker: { sectionId: string; at: number; list: boolean } | null = null
  let focusPending = opts.focusSectionId

  function currentSong(): Song | undefined {
    return getState().songs.find((s) => s.id === songId)
  }

  function beatById(id: string | undefined): Beat | undefined {
    return id ? getState().beats.find((b) => b.id === id) : undefined
  }

  // Бит на N/M занимает в песне N долей (data/beatMeter.ts).
  const fillLength = (beatId: string) => beatLengthInBeats(beatById(beatId))

  function beatLabel(id: string | undefined): string {
    const beat = beatById(id)
    return beat ? `«${beat.name}»` : 'бит удалён'
  }

  function updateSong(patch: Partial<Song>) {
    saveSongs(getState().songs.map((s) => (s.id === songId ? { ...s, ...patch } : s)))
  }

  // --- темп и размер песни ---
  const setSongBpm = (bpm: number) => updateSong({ bpm: clampBpm(bpm) })
  const tempo = createTempoField({
    key: 'song-bpm',
    get: () => currentSong()?.bpm ?? CONFIG.DEFAULT_BPM,
    set: setSongBpm,
    rerender: () => render(),
    buttonClass: 'tempo-button',
    inputClass: 'input tempo-input',
  })
  const meterField = createMeterField({
    get: () => songMeter(currentSong()!),
    // Размер меняет число долей в секциях — филлы за новым концом уходят.
    set: (meter) => {
      const song = currentSong()
      if (song) saveSongs(getState().songs.map((s) => (s.id === songId ? withSongMeter(song, meter) : s)))
    },
    rerender: () => render(),
    align: 'end',
  })

  function tempoRow(song: Song): HTMLElement {
    return h(
      'div',
      { className: 'card row' },
      iconButton('minus', { onClick: () => setSongBpm(song.bpm - 1), ariaLabel: 'Темп: меньше' }),
      tempo.render(),
      h('span', { className: 'text-small text-sub' }, 'BPM'),
      iconButton('plus', { onClick: () => setSongBpm(song.bpm + 1), ariaLabel: 'Темп: больше' }),
      h('div', { className: 'push-right' }, meterField.render())
    )
  }

  function updateSection(sectionId: string, patch: Partial<Section>) {
    const song = currentSong()
    if (!song) return
    updateSong({ sections: song.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...patch } : sec)) })
  }

  const sectionById = (sectionId: string) => currentSong()?.sections.find((s) => s.id === sectionId)

  function assignFill(sectionId: string, at: number, beatId: string) {
    const fills = (sectionById(sectionId)?.fills ?? []).filter((f) => f.at !== at)
    fillPicker = null
    updateSection(sectionId, { fills: [...fills, { at, beatId }].sort((a, b) => a.at - b.at) })
  }

  // «Редактировать» на доле: правится то, что звучит в этом квадратике, и
  // только здесь (решение пользователя) — всегда через новый бит-филл на
  // этой доле, общие биты библиотеки не трогаются:
  //   стоит филл → его копия встаёт на его место;
  //   звучит грув секции → кусок грува на эту долю (M клеток) → филл;
  //   звучит паттерн песни → его кусок на эту долю → филл;
  //   только щелчок → пустой филл 1/4 (пустой филл — пауза).
  function editAt(sectionId: string, at: number) {
    const song = currentSong()
    const index = song?.sections.findIndex((s) => s.id === sectionId) ?? -1
    if (!song || index < 0) return
    const sec = song.sections[index]
    const fills = sec.fills ?? []
    const id = `beat_${Date.now()}`
    const covering = fills
      .filter((f) => beatById(f.beatId) && at >= f.at && at < f.at + fillLength(f.beatId))
      .sort((a, b) => b.at - a.at)[0]
    let beat: Beat
    let fillAt = at
    if (covering) {
      const source = beatById(covering.beatId)!
      // Темп копии — темп песни: в редакторе она звучит так же, как здесь.
      beat = { ...source, id, name: `${source.name} (копия)`, bpm: song.bpm, tracks: source.tracks.map((t) => ({ ...t, steps: [...t.steps] })) }
      fillAt = covering.at
    } else {
      beat = sliceForBeat(song, index, at, id, getState().beats)
    }
    saveBeats([...getState().beats, beat])
    fillPicker = null
    updateSection(sectionId, { fills: [...fills.filter((f) => f.at !== fillAt), { at: fillAt, beatId: id }].sort((a, b) => a.at - b.at) })
    opts.onEditBeat(id, sectionId)
  }

  // «Копировать влево/вправо»: квадратик целиком — в соседний (решение
  // пользователя). Что именно копируется — squareContent (data/songs.ts):
  // филл на эту долю — он сам, кусок филла/грува/паттерна — новый бит на
  // долю, только щелчок — у соседа просто снимается его филл. Филл,
  // стоявший на соседнем квадратике, заменяется. Меню переезжает на копию —
  // можно жать дальше, как копия вбок в сетке бита.
  function copyBeside(sectionId: string, at: number, direction: 1 | -1) {
    const song = currentSong()
    const index = song?.sections.findIndex((s) => s.id === sectionId) ?? -1
    if (!song || index < 0) return
    const sec = song.sections[index]
    const target = at + direction
    if (target < 0 || target >= sectionBeatCount(sec, song.beatsPerBar)) return
    const content = squareContent(song, index, at, `beat_${Date.now()}`, getState().beats)
    const fills = (sec.fills ?? []).filter((f) => f.at !== target)
    if (content && 'beat' in content) {
      saveBeats([...getState().beats, content.beat])
      fills.push({ at: target, beatId: content.beat.id })
    } else if (content) {
      fills.push({ at: target, beatId: content.beatId })
    }
    fillPicker = { sectionId, at: target, list: false }
    updateSection(sectionId, { fills: fills.sort((a, b) => a.at - b.at) })
  }

  function addSection() {
    const song = currentSong()
    if (!song) return
    const section: Section = { ...newSection, id: newSectionId(), bars: clampBars(newSection.bars), intro: false }
    showAddForm = false
    newSection = emptySectionForm()
    updateSong({ sections: [...song.sections, section] })
  }

  function removeSection(sectionId: string) {
    const song = currentSong()
    const sec = song?.sections.find((s) => s.id === sectionId)
    if (!song || !sec || sec.intro) return
    if (!confirm(`Удалить секцию "${sec.name}"?`)) return
    if (fillPicker?.sectionId === sectionId) fillPicker = null
    if (editingId === sectionId) editingId = null
    updateSong({ sections: song.sections.filter((s) => s.id !== sectionId) })
  }

  function startEdit(sectionId: string) {
    const sec = sectionById(sectionId)
    if (!sec) return
    editingId = sectionId
    editData = { name: sec.name || 'VERSE', bars: sec.bars || 1, comment: sec.comment || '', beatId: sec.beatId }
    showAddForm = false
    render()
  }

  function saveEdit() {
    const song = currentSong()
    if (!song || editingId === null) return
    const id = editingId
    editingId = null
    // Секцию укоротили — филлы, начинавшиеся за её новым концом, убираем.
    const sections = song.sections.map((sec) => (sec.id === id ? { ...sec, ...editData, bars: clampBars(editData.bars) } : sec))
    updateSong({ sections: pruneFills(sections, song.beatsPerBar) })
  }

  function reorderSections(from: number, to: number) {
    const song = currentSong()
    if (!song || from === to || song.sections[to]?.intro) return
    const sections = [...song.sections]
    const [moved] = sections.splice(from, 1)
    sections.splice(to, 0, moved)
    updateSong({ sections })
  }

  // Форма секции правит черновик (data) и сама себя НЕ перерисовывает: ввод
  // в поле, перерисованном на каждую букву, терял фокус — клавиатура
  // закрывалась после каждого символа. Внешние перерисовки (снимок
  // Firestore посреди ввода) переживают фокус и курсор благодаря ключам
  // полей (mount() в dom.ts).
  function sectionForm(keyPrefix: string, data: SectionFormData, onSubmit: () => void, onCancel: () => void) {
    const barsInput = h('input', {
      type: 'text',
      className: 'input input--center',
      key: `${keyPrefix}-bars`,
      inputMode: 'numeric',
      autocomplete: 'off',
      value: String(data.bars),
      // Пока печатают — только запоминаем число (пустое поле не трогаем, «3»
      // по пути к «32» не обрезаем); в пределы приводим, когда ввод закончен.
      onInput: (e: Event) => {
        const value = keepDigits(e.target as HTMLInputElement, 2)
        if (value !== '') data.bars = Number(value)
      },
      onChange: () => {
        data.bars = clampBars(data.bars)
        barsInput.value = String(data.bars)
      },
    })
    const stepBars = (delta: number) => {
      data.bars = clampBars(clampBars(data.bars) + delta)
      barsInput.value = String(data.bars)
    }
    return h(
      'div',
      { className: 'card stack' },
      h(
        'select',
        {
          className: 'input',
          key: `${keyPrefix}-name`,
          onChange: (e: Event) => (data.name = (e.target as HTMLSelectElement).value),
        },
        ...SECTION_TYPES.map((t) => h('option', { value: t, selected: t === data.name }, t))
      ),
      h(
        'div',
        { className: 'row row--3' },
        iconButton('minus', { onClick: () => stepBars(-1), ariaLabel: 'Меньше тактов' }),
        barsInput,
        iconButton('plus', { onClick: () => stepBars(1), ariaLabel: 'Больше тактов' })
      ),
      h('input', {
        className: 'input',
        key: `${keyPrefix}-comment`,
        placeholder: 'Комментарий (опционально)',
        maxLength: String(CONFIG.MAX_COMMENT_LENGTH),
        value: data.comment,
        onInput: (e: Event) => (data.comment = (e.target as HTMLInputElement).value.slice(0, CONFIG.MAX_COMMENT_LENGTH)),
      }),
      h(
        'label',
        { className: 'stack stack--1' },
        h('span', { className: 'text-small text-sub' }, 'Бит секции'),
        h(
          'select',
          {
            className: 'input',
            key: `${keyPrefix}-beat`,
            onChange: (e: Event) => (data.beatId = (e.target as HTMLSelectElement).value || undefined),
          },
          h('option', { value: '', selected: !data.beatId }, 'Паттерн песни'),
          ...getState().beats.map((b) =>
            h('option', { value: b.id, selected: b.id === data.beatId }, `${b.name} · ${b.beatsPerBar}/${b.beatDivision}`)
          ),
          // Назначенный бит удалён из библиотеки — показать это, а не молча
          // переключить на «Паттерн песни».
          data.beatId && !beatById(data.beatId) ? h('option', { value: data.beatId, selected: true }, 'бит удалён') : null
        )
      ),
      h(
        'div',
        { className: 'row row--3' },
        button('Сохранить', { variant: 'accent', iconName: 'floppy-disk', onClick: onSubmit }),
        button('', { iconName: 'x', onClick: onCancel })
      )
    )
  }

  // Сколько тактов помещается в строку сетки — целыми, как в v1 (там 2
  // такта по 4 доли = 8 квадратиков): строка не больше 8, но не меньше
  // одного такта (при 9+ долях в такте — такт на строку).
  function barGridColumns(beatsPerBar: number): number {
    return beatsPerBar * Math.max(1, Math.floor(8 / beatsPerBar))
  }

  function barGrid(sec: Section, beatsPerBar: number, firstBar: number) {
    const sectionBeats = sectionBeatCount(sec, beatsPerBar)
    const grid = h('div', { className: 'bar-grid' })
    grid.style.setProperty('--bar-grid-columns', String(barGridColumns(beatsPerBar)))
    const fills = sec.fills ?? []
    for (let i = 0; i < sectionBeats; i++) {
      const underFill = fills.some((f) => i >= f.at && i < Math.min(f.at + fillLength(f.beatId), sectionBeats))
      const cell = h('button', {
        type: 'button',
        className:
          'bar-grid__cell' +
          (i % beatsPerBar === 0 ? ' bar-grid__cell--bar-start' : '') +
          (underFill ? ' bar-grid__cell--fill' : '') +
          (fills.some((f) => f.at === i) ? ' bar-grid__cell--fill-start' : '') +
          (fillPicker?.sectionId === sec.id && fillPicker.at === i ? ' bar-grid__cell--picked' : ''),
        'aria-label': `Доля ${i + 1} — филл`,
        dataset: { beat: String(firstBar * beatsPerBar + i) },
        onClick: () => {
          const same = fillPicker?.sectionId === sec.id && fillPicker.at === i
          fillPicker = same ? null : { sectionId: sec.id, at: i, list: false }
          render()
        },
      })
      beatCells.push(cell)
      grid.append(cell)
    }
    return grid
  }

  // Меню квадратика (решение пользователя — только кнопки): «Редактировать»,
  // «Из списка» (список битов библиотеки — вставить филл с этой доли),
  // «Копировать влево/вправо» (на крайнем квадратике секции — неактивна), ×.
  function renderFillPicker(sec: Section, at: number, list: boolean, beatsPerBar: number): HTMLElement {
    const startsHere = (sec.fills ?? []).find((f) => f.at === at)
    const beats = getState().beats
    const last = sectionBeatCount(sec, beatsPerBar) - 1
    return h(
      'div',
      { className: 'card card--inset stack stack--2' },
      // Только иконки (решение пользователя) — те же, что в тулбаре сетки
      // бита.
      h(
        'div',
        { className: 'row' },
        iconButton('pencil-simple', { ariaLabel: 'Редактировать', onClick: () => editAt(sec.id, at) }),
        iconButton('list', {
          ariaLabel: 'Из списка',
          onClick: () => {
            fillPicker = { sectionId: sec.id, at, list: !list }
            render()
          },
        }),
        iconButton(['caret-left', 'copy'], { ariaLabel: 'Копировать влево', disabled: at <= 0, onClick: () => copyBeside(sec.id, at, -1) }),
        iconButton(['copy', 'caret-right'], { ariaLabel: 'Копировать вправо', disabled: at >= last, onClick: () => copyBeside(sec.id, at, 1) }),
        h('div', { className: 'push-right' }, iconButton('x', { onClick: () => { fillPicker = null; render() }, ariaLabel: 'Закрыть' }))
      ),
      !list
        ? null
        : beats.length === 0
          ? h('p', { className: 'text-small text-muted' }, 'В библиотеке пока нет битов — создайте их в «Битах».')
          : h(
              'div',
              { className: 'stack stack--2' },
              ...beats.map((b) =>
                h(
                  'button',
                  { type: 'button', className: 'list-row', onClick: () => assignFill(sec.id, at, b.id) },
                  icon('drum'),
                  h('span', { className: 'grow' }, b.name),
                  h('span', { className: 'badge' }, `${b.beatsPerBar}/${b.beatDivision}`),
                  h('span', { className: 'badge' }, `${b.beatsPerBar} дол.`),
                  startsHere?.beatId === b.id ? icon('check-circle') : null
                )
              )
            )
    )
  }

  function sectionCard(sec: Section, index: number, beatsPerBar: number, firstBar: number) {
    return h(
      'div',
      {
        className: 'card',
        draggable: !sec.intro,
        dataset: { sectionId: sec.id },
        onDragStart: () => (dragFrom = sec.intro ? null : index),
        onDragOver: (e: DragEvent) => e.preventDefault(),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          if (dragFrom != null) reorderSections(dragFrom, index)
          dragFrom = null
        },
      },
      h(
        'div',
        { className: 'row' },
        sec.intro ? null : icon('dots-six-vertical'),
        h('span', { className: 'text-bold' }, sec.name),
        h('span', { className: 'badge' }, `${sec.bars} такт.`),
        sec.intro
          ? null
          : h(
              'div',
              { className: 'row row--1 push-right' },
              iconButton('pencil-simple', { onClick: () => startEdit(sec.id), ariaLabel: 'Редактировать секцию' }),
              iconButton('trash', { variant: 'danger', onClick: () => removeSection(sec.id), ariaLabel: 'Удалить секцию' })
            )
      ),
      sec.comment ? h('div', { className: 'mt-2 text-bold' }, sec.comment) : null,
      sec.beatId ? h('div', { className: 'mt-2 text-small text-sub' }, `Бит: ${beatLabel(sec.beatId)}`) : null,
      // Филлы видны только отметками на квадратиках — без строк «Филл … с
      // доли N» (решение пользователя).
      barGrid(sec, beatsPerBar, firstBar),
      fillPicker?.sectionId === sec.id ? renderFillPicker(sec, fillPicker.at, fillPicker.list, beatsPerBar) : null,
      editingId === sec.id
        ? sectionForm(`edit-${sec.id}`, editData, saveEdit, () => {
            editingId = null
            render()
          })
        : null
    )
  }

  function render() {
    beatCells = []
    sectionCards = []
    const gate = accountGate('Войдите — песни и плейлисты хранятся в вашем аккаунте и видны на любом устройстве.')
    if (gate) {
      mount(container, gate)
      return
    }
    const song = currentSong()
    if (!song) {
      mount(
        container,
        getState().songsLoaded
          ? h('p', {}, 'Песня не найдена — возможно, её удалили с другого устройства.')
          : h('p', { className: 'text-center text-muted' }, 'Загрузка…')
      )
      return
    }
    // Секцию, которую правили или где открыт выбор филла, удалили (в том
    // числе с другого устройства) — форма и выбор закрываются, а не
    // переезжают на соседнюю.
    if (editingId !== null && !song.sections.some((s) => s.id === editingId)) editingId = null
    if (fillPicker && !song.sections.some((s) => s.id === fillPicker!.sectionId)) fillPicker = null

    let firstBar = 0
    sectionCards = song.sections.map((sec, i) => {
      const card = sectionCard(sec, i, song.beatsPerBar, firstBar)
      firstBar += sec.bars
      return card
    })
    mount(
      container,
      h(
        'div',
        { className: 'stack' },
        tempoRow(song),
        ...sectionCards,
        showAddForm
          ? sectionForm('new', newSection, addSection, () => {
              showAddForm = false
              render()
            })
          : button('Добавить секцию', {
              iconName: 'plus',
              onClick: () => {
                showAddForm = true
                editingId = null
                render()
              },
            }),
        h('hr', { className: 'divider' }),
        button('Редактор паттерна', { iconName: 'grid-four', onClick: opts.onOpenPattern })
      )
    )
    // Элементы сетки новые — вернуть на них текущую закраску сразу, не
    // дожидаясь следующей доли.
    showPlayback(lastPlayback, true)
    // Вернулись из редактора бита — показать ту же секцию (как только песня
    // есть на экране: после обновления страницы она приходит позже).
    if (focusPending !== null) {
      const index = song.sections.findIndex((s) => s.id === focusPending)
      sectionCards[index]?.scrollIntoView({ block: 'center' })
      focusPending = null
    }
  }

  // Закраска сетки по текущей доле. После перерисовки (новые элементы)
  // вызывается с force — иначе пропустила бы ту же долю.
  function showPlayback(playback: PlaybackState, force = false) {
    const song = currentSong()
    if (!song) return
    const current = engine.isPlaying ? playback.bar * song.beatsPerBar + (playback.beat - 1) : -1
    if (current !== shownBeat || force) {
      shownBeat = current
      beatCells.forEach((cell) => {
        const beat = Number(cell.dataset.beat)
        cell.classList.toggle('bar-grid__cell--filled', current >= 0 && beat < current)
        cell.classList.toggle('bar-grid__cell--current', beat === current)
      })
    }
    let section = -1
    if (engine.isPlaying) {
      let end = 0
      section = song.sections.findIndex((sec) => playback.bar < (end += sec.bars))
    }
    sectionCards.forEach((card, i) => card.classList.toggle('card--active', i === section))
    // Новая секция во время игры — доехать до неё, как в v1.
    if (section !== shownSection) {
      shownSection = section
      if (section >= 0) sectionCards[section]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const releasePlayback = engine.onPlaybackState((playback) => {
    lastPlayback = playback
    showPlayback(playback)
  })

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    releasePlayback()
  }
}
