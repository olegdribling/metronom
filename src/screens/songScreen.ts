// Экран песни: секции (порядок, такты, комментарий), вход в редактор
// паттерна. Одна песня внутри плейлиста — Song из state.songs.
//
// В каждой секции — сетка долей (.bar-grid), как в v1 (SectionCard.tsx):
// квадратик на долю, по beatsPerBar на такт. Во время игры прошедшие доли
// закрашены, текущая выделена, карточка текущей секции — .card--active, и
// экран сам доезжает до неё. Это горячий путь: обновляется напрямую в DOM
// из engine.onPlaybackState, в обход перерисовки экрана (как подсветка доли
// в metronomeScreen.ts и шага в patternScreen.ts).
//
// Биты из библиотеки в секциях: в форме секции — «Бит секции» (грув на всю
// секцию вместо паттерна песни), тап по квадратику-доле — филл с этой доли
// (бит на N/M занимает N долей, доли под ним отмечены). В песне хранятся
// только ссылки (beatId), паттерны подставляет app.ts для движка.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { icon } from '../icons.ts'
import { CONFIG, SECTION_TYPES } from '../config.ts'
import { Beat, PlaybackState, Section, SectionFill, SectionFormData, Song } from '../types.ts'
import type { AudioEngine } from '../engine/audioEngine.ts'
import { getState, subscribe, saveSongs } from '../state/appState.ts'

const emptySectionForm = (): SectionFormData => ({ name: 'VERSE', bars: 4, comment: '' })

export function mountSongScreen(
  container: HTMLElement,
  songId: number,
  engine: AudioEngine,
  onOpenPattern: () => void,
  onDeleted: () => void
): () => void {
  let showAddForm = false
  let newSection = emptySectionForm()
  let editingIndex: number | null = null
  let editData = emptySectionForm()
  let dragFrom: number | null = null
  // Квадратики долей текущей отрисовки: data-beat — номер доли от начала
  // песни (такт × beatsPerBar + доля), его же считает движок.
  let beatCells: HTMLElement[] = []
  let sectionCards: HTMLElement[] = []
  let shownBeat = -1
  let shownSection = -1
  let lastPlayback: PlaybackState = getState().playbackState
  // Открытый выбор филла: секция и доля (от начала секции, с 0).
  let fillPicker: { section: number; at: number } | null = null

  function currentSong(): Song | undefined {
    return getState().songs.find((s) => s.id === songId)
  }

  function beatById(id: string | undefined): Beat | undefined {
    return id ? getState().beats.find((b) => b.id === id) : undefined
  }

  // Бит на N/M занимает в песне N долей (data/beatMeter.ts).
  function fillLength(fill: SectionFill): number {
    return beatById(fill.beatId)?.beatsPerBar ?? 1
  }

  function beatLabel(id: string | undefined): string {
    const beat = beatById(id)
    return beat ? `«${beat.name}»` : 'бит удалён'
  }

  function updateSection(index: number, patch: Partial<Section>) {
    const song = currentSong()
    if (!song) return
    updateSong({ sections: song.sections.map((sec, i) => (i === index ? { ...sec, ...patch } : sec)) })
  }

  function assignFill(index: number, at: number, beatId: string) {
    const fills = (currentSong()?.sections[index]?.fills ?? []).filter((f) => f.at !== at)
    updateSection(index, { fills: [...fills, { at, beatId }].sort((a, b) => a.at - b.at) })
    fillPicker = null
    render()
  }

  function removeFill(index: number, at: number) {
    const fills = (currentSong()?.sections[index]?.fills ?? []).filter((f) => f.at !== at)
    updateSection(index, { fills })
    fillPicker = null
    render()
  }

  function updateSong(patch: Partial<Song>) {
    const state = getState()
    saveSongs(state.songs.map((s) => (s.id === songId ? { ...s, ...patch } : s)))
  }

  function addSection() {
    const song = currentSong()
    if (!song) return
    const section: Section = { ...newSection, bars: Math.max(1, newSection.bars), intro: false }
    updateSong({ sections: [...song.sections, section] })
    showAddForm = false
    newSection = emptySectionForm()
    render()
  }

  function removeSection(index: number) {
    const song = currentSong()
    if (!song || song.sections[index]?.intro) return
    fillPicker = null
    updateSong({ sections: song.sections.filter((_, i) => i !== index) })
    render()
  }

  function startEdit(index: number) {
    const song = currentSong()
    const sec = song?.sections[index]
    if (!sec) return
    editingIndex = index
    editData = { name: sec.name || 'VERSE', bars: sec.bars || 1, comment: sec.comment || '', beatId: sec.beatId }
    showAddForm = false
    render()
  }

  function saveEdit() {
    const song = currentSong()
    if (!song || editingIndex == null) return
    const bars = Math.max(1, editData.bars)
    const sectionBeats = bars * getState().beatsPerBar
    const sections = song.sections.map((sec, i) =>
      // Секцию укоротили — филлы, начинавшиеся за её новым концом, убираем.
      i === editingIndex ? { ...sec, ...editData, bars, fills: sec.fills?.filter((f) => f.at < sectionBeats) } : sec
    )
    updateSong({ sections })
    editingIndex = null
    render()
  }

  function reorderSections(from: number, to: number) {
    const song = currentSong()
    if (!song || from === to || song.sections[to]?.intro) return
    const sections = [...song.sections]
    const [moved] = sections.splice(from, 1)
    sections.splice(to, 0, moved)
    fillPicker = null
    updateSong({ sections })
    render()
  }

  function deleteSong() {
    if (!confirm(`Удалить песню "${currentSong()?.name}"? Это нельзя отменить.`)) return
    const state = getState()
    saveSongs(state.songs.filter((s) => s.id !== songId))
    onDeleted()
  }

  function sectionForm(data: SectionFormData, onFieldChange: (patch: Partial<SectionFormData>) => void, onSubmit: () => void, onCancel: () => void) {
    return h(
      'div',
      { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
      h(
        'select',
        {
          className: 'input',
          onChange: (e: Event) => onFieldChange({ name: (e.target as HTMLSelectElement).value }),
        },
        ...SECTION_TYPES.map((t) => h('option', { value: t, selected: t === data.name }, t))
      ),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        iconButton('minus', { onClick: () => onFieldChange({ bars: Math.max(1, data.bars - 1) }), ariaLabel: 'Меньше тактов' }),
        h('input', {
          type: 'number',
          className: 'input',
          style: { textAlign: 'center' },
          value: String(data.bars),
          onInput: (e: Event) => onFieldChange({ bars: Math.max(1, Number((e.target as HTMLInputElement).value)) }),
        }),
        iconButton('plus', { onClick: () => onFieldChange({ bars: Math.min(16, data.bars + 1) }), ariaLabel: 'Больше тактов' })
      ),
      h('input', {
        className: 'input',
        placeholder: 'Комментарий (опционально)',
        value: data.comment,
        onInput: (e: Event) => onFieldChange({ comment: (e.target as HTMLInputElement).value.slice(0, CONFIG.MAX_COMMENT_LENGTH) }),
      }),
      h(
        'label',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' } },
        h('span', { style: { fontSize: 'var(--font-size-small)', color: 'var(--color-text-sub)' } }, 'Бит секции'),
        h(
          'select',
          {
            className: 'input',
            onChange: (e: Event) => onFieldChange({ beatId: (e.target as HTMLSelectElement).value || undefined }),
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
        { style: { display: 'flex', gap: 'var(--space-3)' } },
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

  function barGrid(sec: Section, index: number, firstBar: number) {
    const beatsPerBar = getState().beatsPerBar
    const sectionBeats = sec.bars * beatsPerBar
    const grid = h('div', { className: 'bar-grid' })
    grid.style.setProperty('--bar-grid-columns', String(barGridColumns(beatsPerBar)))
    const fills = sec.fills ?? []
    for (let i = 0; i < sectionBeats; i++) {
      const underFill = fills.some((f) => i >= f.at && i < Math.min(f.at + fillLength(f), sectionBeats))
      const cell = h('button', {
        type: 'button',
        className:
          'bar-grid__cell' +
          (i % beatsPerBar === 0 ? ' bar-grid__cell--bar-start' : '') +
          (underFill ? ' bar-grid__cell--fill' : '') +
          (fills.some((f) => f.at === i) ? ' bar-grid__cell--fill-start' : '') +
          (fillPicker?.section === index && fillPicker.at === i ? ' bar-grid__cell--picked' : ''),
        'aria-label': `Доля ${i + 1} — филл`,
        dataset: { beat: String(firstBar * beatsPerBar + i) },
        onClick: () => {
          const same = fillPicker?.section === index && fillPicker.at === i
          fillPicker = same ? null : { section: index, at: i }
          render()
        },
      })
      beatCells.push(cell)
      grid.append(cell)
    }
    return grid
  }

  // Выбор филла для доли: список битов библиотеки (имя, размер, сколько
  // долей займёт) + «Убрать», если с этой доли (или поверх неё) уже стоит филл.
  function renderFillPicker(sec: Section, index: number, at: number): HTMLElement {
    const fills = sec.fills ?? []
    const startsHere = fills.find((f) => f.at === at)
    const covering = startsHere ?? fills.find((f) => at > f.at && at < f.at + fillLength(f))
    const beats = getState().beats
    return h(
      'div',
      { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', background: 'var(--color-bg)' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } },
        h('span', { style: { flex: '1', fontWeight: 'var(--font-weight-bold)' } }, `Филл с доли ${at + 1}`),
        iconButton('x', { onClick: () => { fillPicker = null; render() }, ariaLabel: 'Закрыть' })
      ),
      covering
        ? h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } },
            h('span', { style: { flex: '1', fontSize: 'var(--font-size-small)', color: 'var(--color-text-sub)' } },
              covering === startsHere ? `Сейчас: ${beatLabel(covering.beatId)}` : `Доля под филлом ${beatLabel(covering.beatId)} с доли ${covering.at + 1}`),
            button('Убрать филл', { variant: 'danger', onClick: () => removeFill(index, covering.at) })
          )
        : null,
      beats.length === 0
        ? h('p', { style: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-small)' } }, 'В библиотеке пока нет битов — создайте их в «Битах».')
        : h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
            ...beats.map((b) =>
              h(
                'button',
                { type: 'button', className: 'list-row', onClick: () => assignFill(index, at, b.id) },
                icon('drum'),
                h('span', { style: { flex: '1', textAlign: 'left' } }, b.name),
                h('span', { className: 'badge' }, `${b.beatsPerBar}/${b.beatDivision}`),
                h('span', { className: 'badge' }, `${b.beatsPerBar} дол.`),
                startsHere?.beatId === b.id ? icon('check-circle') : null
              )
            )
          )
    )
  }

  function sectionCard(sec: Section, index: number, firstBar: number) {
    const isEditing = editingIndex === index
    return h(
      'div',
      {
        className: 'card',
        draggable: !sec.intro,
        dataset: { sectionIndex: String(index) },
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
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } },
        sec.intro ? null : icon('dots-six-vertical'),
        h('span', { style: { fontWeight: 'var(--font-weight-bold)' } }, sec.name),
        h('span', { className: 'badge' }, `${sec.bars} такт.`),
        sec.intro
          ? null
          : h(
              'div',
              { style: { marginLeft: 'auto', display: 'flex', gap: 'var(--space-1)' } },
              iconButton('pencil-simple', { onClick: () => startEdit(index), ariaLabel: 'Редактировать секцию' }),
              iconButton('trash', { variant: 'danger', onClick: () => removeSection(index), ariaLabel: 'Удалить секцию' })
            )
      ),
      sec.comment ? h('div', { style: { marginTop: 'var(--space-2)', fontWeight: 'var(--font-weight-bold)' } }, sec.comment) : null,
      sec.beatId
        ? h('div', { style: { marginTop: 'var(--space-2)', fontSize: 'var(--font-size-small)', color: 'var(--color-text-sub)' } },
            `Бит: ${beatLabel(sec.beatId)}`)
        : null,
      barGrid(sec, index, firstBar),
      ...(sec.fills ?? []).map((f) =>
        h('div', { style: { marginTop: 'var(--space-1)', fontSize: 'var(--font-size-small)', color: 'var(--color-text-sub)' } },
          `Филл ${beatLabel(f.beatId)} с доли ${f.at + 1}`)
      ),
      fillPicker?.section === index ? renderFillPicker(sec, index, fillPicker.at) : null,
      isEditing
        ? sectionForm(
            editData,
            (patch) => {
              editData = { ...editData, ...patch }
              render()
            },
            saveEdit,
            () => {
              editingIndex = null
              render()
            }
          )
        : null
    )
  }

  function render() {
    const song = currentSong()
    if (!song) {
      mount(container, h('p', {}, 'Песня не найдена — возможно, её удалили с другого устройства.'))
      return
    }
    beatCells = []
    let firstBar = 0
    sectionCards = song.sections.map((sec, i) => {
      const card = sectionCard(sec, i, firstBar)
      firstBar += sec.bars
      return card
    })
    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
        ...sectionCards,
        showAddForm
          ? sectionForm(
              newSection,
              (patch) => {
                newSection = { ...newSection, ...patch }
                render()
              },
              addSection,
              () => {
                showAddForm = false
                render()
              }
            )
          : button('Добавить секцию', {
              iconName: 'plus',
              onClick: () => {
                showAddForm = true
                editingIndex = null
                render()
              },
            }),
        h('hr', { style: { border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--space-3) 0' } }),
        button('Редактор паттерна', { iconName: 'grid-four', onClick: onOpenPattern }),
        button('Удалить песню', { variant: 'danger', iconName: 'trash', onClick: deleteSong })
      )
    )
    // Элементы сетки новые — вернуть на них текущую закраску сразу, не
    // дожидаясь следующей доли.
    showPlayback(lastPlayback, true)
  }

  // Закраска сетки по текущей доле. После перерисовки (новые элементы)
  // вызывается с force — иначе пропустила бы ту же долю.
  function showPlayback(playback: PlaybackState, force = false) {
    const song = currentSong()
    const beatsPerBar = getState().beatsPerBar
    const current = engine.isPlaying ? playback.bar * beatsPerBar + (playback.beat - 1) : -1
    if (current !== shownBeat || force) {
      shownBeat = current
      beatCells.forEach((cell) => {
        const beat = Number(cell.dataset.beat)
        cell.classList.toggle('bar-grid__cell--filled', current >= 0 && beat < current)
        cell.classList.toggle('bar-grid__cell--current', beat === current)
      })
    }
    let section = -1
    if (song && engine.isPlaying) {
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

  engine.onPlaybackState((playback) => {
    lastPlayback = playback
    showPlayback(playback)
  })

  const unsubscribe = subscribe(render)
  render()
  return () => {
    unsubscribe()
    // Слот у движка один — не держать обновления отсоединённого экрана.
    engine.onPlaybackState(() => {})
  }
}
