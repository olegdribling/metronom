// Редактор одного бита/брейка: сетка шагов на дорожку-роль + инструменты
// быстрой сборки паттерна (выделить диапазон → копия влево/вправо, вставить
// в любое место, залить до конца) — идея из внешнего референса
// (realdrummetronome.com/editor), адаптированная под тап вместо
// зажать-и-потянуть (надёжнее на мыши и тачскрине без отдельной библиотеки
// жестов).
//
// Название не редактируется вживую — только через «Сохранить» (запрашивает
// имя и подтверждение), чтобы не держать на экране лишний постоянный ввод.
// Прослушивание внутри редактора сейчас не показывается (см. правки после
// первой версии) — Beat всё ещё резолвится в обычный Pattern через
// resolveBeatPattern() (data/resolveBeat.ts) для будущего использования
// (превью/подключение к песням), audioEngine.ts не знает про Beat/DrumKit.
import { h, mount } from '../dom.ts'
import { button, iconButton } from '../components/button.ts'
import { icon } from '../icons.ts'
import { DRUM_ROLES, DRUM_ROLE_COLORS, DRUM_ROLE_LABELS, PATTERN_STEPS } from '../config.ts'
import { Beat, DrumRole } from '../types.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'
import { shareBeat } from '../data/sharedBeatApi.ts'

type EditMode = 'normal' | 'selecting' | 'selected' | 'pasting'
type Clipboard = { width: number; rows: Record<string, boolean[]> }

export function mountBeatEditorScreen(container: HTMLElement, beatId: string, onDone: () => void): () => void {
  let mode: EditMode = 'normal'
  let selStart: number | null = null
  let selEnd: number | null = null
  let clipboard: Clipboard | null = null
  let pasteAnchor = 0
  let showAddRole = false
  let sharing = false
  let shareCode: string | null = null
  let errorMessage: string | null = null
  let showSaveDialog = false
  let nameDraft = ''

  function currentBeat(): Beat | undefined {
    return getState().beats.find((b) => b.id === beatId)
  }

  function updateBeat(patch: Partial<Beat>) {
    const state = getState()
    saveBeats(state.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)))
  }

  // --- дорожки-роли ---
  function addRole(role: DrumRole) {
    const beat = currentBeat()
    if (!beat) return
    updateBeat({ tracks: [...beat.tracks, { role, steps: Array(beat.bars * PATTERN_STEPS).fill(false) }] })
    showAddRole = false
    render()
  }

  function removeRole(role: DrumRole) {
    const beat = currentBeat()
    if (!beat) return
    updateBeat({ tracks: beat.tracks.filter((t) => t.role !== role) })
    render()
  }

  function toggleStep(role: DrumRole, stepIndex: number) {
    const beat = currentBeat()
    if (!beat) return
    updateBeat({
      tracks: beat.tracks.map((t) =>
        t.role === role ? { ...t, steps: t.steps.map((v, i) => (i === stepIndex ? !v : v)) } : t
      ),
    })
  }

  // --- выделение диапазона (тап-тап вместо зажать-потянуть — надёжнее без
  // отдельного жестового слоя) ---
  function selectionRange(): [number, number] | null {
    if (selStart === null || selEnd === null) return null
    return [Math.min(selStart, selEnd), Math.max(selStart, selEnd)]
  }

  function cancelSelection() {
    mode = 'normal'
    selStart = null
    selEnd = null
    clipboard = null
    render()
  }

  function handleCellTap(role: DrumRole, stepIndex: number) {
    if (mode === 'normal') {
      toggleStep(role, stepIndex)
    } else if (mode === 'selecting') {
      if (selStart === null) selStart = stepIndex
      else {
        selEnd = stepIndex
        mode = 'selected'
      }
      render()
    } else if (mode === 'pasting' && clipboard) {
      const beat = currentBeat()
      if (!beat) return
      const total = beat.bars * PATTERN_STEPS
      pasteAnchor = Math.max(0, Math.min(stepIndex, total - clipboard.width))
      render()
    }
  }

  function copyAdjacent(direction: 1 | -1) {
    const beat = currentBeat()
    const range = selectionRange()
    if (!beat || !range) return
    const [start, end] = range
    const width = end - start + 1
    const total = beat.bars * PATTERN_STEPS
    const dest = direction === 1 ? end + 1 : start - width
    if (dest < 0 || dest + width > total) return // некуда копировать — за границей
    updateBeat({
      tracks: beat.tracks.map((t) => {
        const steps = [...t.steps]
        for (let i = 0; i < width; i++) steps[dest + i] = t.steps[start + i]
        return { ...t, steps }
      }),
    })
    selStart = dest
    selEnd = dest + width - 1
    render()
  }

  function fillToEnd() {
    const beat = currentBeat()
    const range = selectionRange()
    if (!beat || !range) return
    const [start, end] = range
    const width = end - start + 1
    const total = beat.bars * PATTERN_STEPS
    updateBeat({
      tracks: beat.tracks.map((t) => {
        const steps = [...t.steps]
        for (let pos = end + 1; pos < total; pos++) steps[pos] = t.steps[start + ((pos - start) % width)]
        return { ...t, steps }
      }),
    })
    render()
  }

  function startCopyToClipboard() {
    const beat = currentBeat()
    const range = selectionRange()
    if (!beat || !range) return
    const [start, end] = range
    const width = end - start + 1
    const rows: Record<string, boolean[]> = {}
    beat.tracks.forEach((t) => (rows[t.role] = t.steps.slice(start, end + 1)))
    clipboard = { width, rows }
    pasteAnchor = Math.min(start, beat.bars * PATTERN_STEPS - width)
    mode = 'pasting'
    render()
  }

  function commitPaste() {
    const beat = currentBeat()
    if (!beat || !clipboard) return
    const cb = clipboard
    updateBeat({
      tracks: beat.tracks.map((t) => {
        const src = cb.rows[t.role]
        if (!src) return t
        const steps = [...t.steps]
        for (let i = 0; i < cb.width; i++) steps[pasteAnchor + i] = src[i]
        return { ...t, steps }
      }),
    })
    render() // остаёмся в режиме вставки — можно вставить ещё раз в другое место
  }

  // --- сохранить (имя) / удалить / поделиться ---
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

  function handleDelete() {
    const state = getState()
    saveBeats(state.beats.filter((b) => b.id !== beatId))
    onDone()
  }

  async function handleShare() {
    const beat = currentBeat()
    if (!beat || sharing) return
    sharing = true
    errorMessage = null
    shareCode = null
    render()
    try {
      shareCode = await shareBeat(beat)
    } catch (err) {
      errorMessage = 'Не удалось поделиться. ' + (err instanceof Error ? err.message : String(err))
    } finally {
      sharing = false
      render()
    }
  }

  function renderToolbar(): HTMLElement {
    if (mode === 'normal') {
      return button('Выделить диапазон', {
        onClick: () => {
          mode = 'selecting'
          selStart = null
          selEnd = null
          render()
        },
      })
    }
    if (mode === 'selecting') {
      return h(
        'div',
        { className: 'card', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        h('span', { style: { flex: '1', color: 'var(--color-text-sub)' } },
          selStart === null ? 'Тапните первый шаг диапазона' : 'Тапните последний шаг диапазона'),
        iconButton('x', { onClick: cancelSelection, ariaLabel: 'Отмена' })
      )
    }
    if (mode === 'selected') {
      return h(
        'div',
        { className: 'card', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' } },
        iconButton('arrow-left', { onClick: () => copyAdjacent(-1), ariaLabel: 'Копия влево' }),
        iconButton('arrow-right', { onClick: () => copyAdjacent(1), ariaLabel: 'Копия вправо' }),
        button('Копировать', { onClick: startCopyToClipboard }),
        button('Залить до конца', { onClick: fillToEnd }),
        h('div', { style: { flex: '1' } }),
        iconButton('x', { onClick: cancelSelection, ariaLabel: 'Отмена' })
      )
    }
    // pasting
    return h(
      'div',
      { className: 'card', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
      h('span', { style: { flex: '1', color: 'var(--color-text-sub)' } }, 'Тапните, куда вставить'),
      button('Вставить', { variant: 'accent', onClick: commitPaste }),
      iconButton('x', { onClick: cancelSelection, ariaLabel: 'Готово' })
    )
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

  function render() {
    const beat = currentBeat()
    if (!beat) {
      mount(container, h('p', {}, 'Бит не найден.'))
      return
    }
    const totalSteps = beat.bars * PATTERN_STEPS
    const range = selectionRange()
    const availableRoles = DRUM_ROLES.filter((r) => !beat.tracks.some((t) => t.role === r))

    const grid = h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: `72px repeat(${totalSteps}, minmax(1.5rem, 1fr))`,
        gap: 'var(--space-1)',
        alignItems: 'center',
        overflowX: 'auto',
      },
    })
    grid.append(h('div', {}))
    for (let i = 0; i < totalSteps; i++) {
      grid.append(
        h('div', { style: { textAlign: 'center', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)' } }, String(i + 1))
      )
    }
    beat.tracks.forEach((track) => {
      grid.append(
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-1)' } },
          h('span', { style: { flex: '1', fontSize: 'var(--font-size-small)', fontWeight: 'var(--font-weight-bold)' } }, DRUM_ROLE_LABELS[track.role]),
          h(
            'button',
            { type: 'button', 'aria-label': `Удалить ${DRUM_ROLE_LABELS[track.role]}`, style: { background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--color-text-muted)' }, onClick: () => removeRole(track.role) },
            icon('trash')
          )
        )
      )
      track.steps.forEach((active, stepIndex) => {
        const inRange = !!range && stepIndex >= range[0] && stepIndex <= range[1]
        const inPastePreview = mode === 'pasting' && !!clipboard && stepIndex >= pasteAnchor && stepIndex < pasteAnchor + clipboard.width
        grid.append(
          h('button', {
            type: 'button',
            className: `step${active ? ' step--on' : ''}${inRange ? ' step--current' : ''}`,
            style: {
              backgroundColor: active ? DRUM_ROLE_COLORS[track.role] : undefined,
              outline: inPastePreview ? '2px dashed var(--color-border-accent)' : undefined,
            },
            dataset: { role: track.role, step: String(stepIndex) },
            onClick: () => handleCellTap(track.role, stepIndex),
          })
        )
      })
    })

    mount(
      container,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' } },
        grid,
        showAddRole
          ? h(
              'div',
              { className: 'card', style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' } },
              ...(availableRoles.length
                ? availableRoles.map((r) => button(DRUM_ROLE_LABELS[r], { onClick: () => addRole(r) }))
                : [h('span', { style: { color: 'var(--color-text-muted)' } }, 'Все роли уже добавлены')])
            )
          : null,
        button(showAddRole ? 'Скрыть' : '+ Добавить дорожку', { onClick: () => { showAddRole = !showAddRole; render() } }),
        renderToolbar(),
        showSaveDialog
          ? renderSaveDialog()
          : h(
              'div',
              { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } },
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' } },
                button('Сохранить', { variant: 'accent', onClick: openSaveDialog }),
                button('Поделиться', { onClick: handleShare, disabled: sharing }),
                button('Удалить', { variant: 'danger', onClick: handleDelete })
              ),
              shareCode ? h('div', {}, 'Код: ', h('span', { style: { fontFamily: 'monospace', fontWeight: 'var(--font-weight-bold)' } }, shareCode)) : null,
              errorMessage ? h('div', { style: { color: 'var(--color-text-danger)' } }, errorMessage) : null
            )
      )
    )
  }

  const unsubscribe = subscribe(render)
  render()
  return unsubscribe
}
