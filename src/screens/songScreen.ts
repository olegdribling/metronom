// Экран песни: секции (порядок, такты, комментарий), вход в редактор
// паттерна. Одна песня внутри плейлиста — Song из state.songs.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { icon } from '../icons.ts'
import { CONFIG, SECTION_TYPES } from '../config.ts'
import { Section, SectionFormData, Song } from '../types.ts'
import { getState, subscribe, saveSongs } from '../state/appState.ts'

const emptySectionForm = (): SectionFormData => ({ name: 'VERSE', bars: 4, comment: '' })

export function mountSongScreen(
  container: HTMLElement,
  songId: number,
  onOpenPattern: () => void,
  onDeleted: () => void
): () => void {
  let showAddForm = false
  let newSection = emptySectionForm()
  let editingIndex: number | null = null
  let editData = emptySectionForm()
  let dragFrom: number | null = null

  function currentSong(): Song | undefined {
    return getState().songs.find((s) => s.id === songId)
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
    updateSong({ sections: song.sections.filter((_, i) => i !== index) })
    render()
  }

  function startEdit(index: number) {
    const song = currentSong()
    const sec = song?.sections[index]
    if (!sec) return
    editingIndex = index
    editData = { name: sec.name || 'VERSE', bars: sec.bars || 1, comment: sec.comment || '' }
    showAddForm = false
    render()
  }

  function saveEdit() {
    const song = currentSong()
    if (!song || editingIndex == null) return
    const sections = song.sections.map((sec, i) =>
      i === editingIndex ? { ...sec, ...editData, bars: Math.max(1, editData.bars) } : sec
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
        'div',
        { style: { display: 'flex', gap: 'var(--space-3)' } },
        button('Сохранить', { variant: 'accent', iconName: 'floppy-disk', onClick: onSubmit }),
        button('', { iconName: 'x', onClick: onCancel })
      )
    )
  }

  function sectionCard(sec: Section, index: number) {
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
    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } },
        ...song.sections.map((sec, i) => sectionCard(sec, i)),
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
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
