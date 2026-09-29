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
import { DRUM_ROLES, DRUM_ROLE_COLORS, DRUM_ROLE_LABELS } from '../config.ts'
import { Beat, DrumRole } from '../types.ts'
import { getState, subscribe, saveBeats } from '../state/appState.ts'
import { shareBeat } from '../data/sharedBeatApi.ts'

type EditMode = 'normal' | 'selecting' | 'selected' | 'pasting'
type Clipboard = { width: number; rows: Record<string, boolean[]> }

// Те же границы, что у «Metrum» кольца метронома (metronomeScreen.ts).
const MIN_BEATS_PER_BAR = 1
const MAX_BEATS_PER_BAR = 16
const MIN_BEAT_DIVISION = 1
const MAX_BEAT_DIVISION = 8
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function totalStepsOf(beat: Beat): number {
  return beat.bars * beat.beatsPerBar * beat.beatDivision
}

function resizeSteps(steps: boolean[], newLength: number): boolean[] {
  if (newLength === steps.length) return steps
  if (newLength < steps.length) return steps.slice(0, newLength)
  return [...steps, ...Array(newLength - steps.length).fill(false)]
}

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
  let showMeterEditor = false

  function currentBeat(): Beat | undefined {
    return getState().beats.find((b) => b.id === beatId)
  }

  function updateBeat(patch: Partial<Beat>) {
    const state = getState()
    saveBeats(state.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)))
  }

  // --- размер такта (как «Metrum» у кольца метронома) ---
  function setMeter(beatsPerBar: number, beatDivision: number) {
    const beat = currentBeat()
    if (!beat) return
    const newTotal = beat.bars * beatsPerBar * beatDivision
    updateBeat({
      beatsPerBar,
      beatDivision,
      tracks: beat.tracks.map((t) => ({ ...t, steps: resizeSteps(t.steps, newTotal) })),
    })
    render()
  }

  // --- дорожки-роли ---
  function addRole(role: DrumRole) {
    const beat = currentBeat()
    if (!beat) return
    updateBeat({ tracks: [...beat.tracks, { role, steps: Array(totalStepsOf(beat)).fill(false) }] })
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
      const total = totalStepsOf(beat)
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
    const total = totalStepsOf(beat)
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
    const total = totalStepsOf(beat)
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
    pasteAnchor = Math.min(start, totalStepsOf(beat) - width)
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

  function renderMeter(beat: Beat): HTMLElement {
    const meterButton = h(
      'button',
      {
        type: 'button',
        // .dial__meter — тот же бейдж «N/M», что у кольца метронома
        // (metronomeScreen.ts), а не своя одноразовая стилизация.
        className: 'dial__meter',
        onClick: () => { showMeterEditor = !showMeterEditor; render() },
      },
      `${beat.beatsPerBar}/${beat.beatDivision}`
    )
    if (!showMeterEditor) return meterButton

    const stepRow = (label: string, value: number, onChange: (v: number) => void, min: number, max: number) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
        h('span', { style: { flex: '1', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-small)' } }, label),
        iconButton('minus', { onClick: () => onChange(clamp(value - 1, min, max)), ariaLabel: `${label}: меньше` }),
        h('span', { style: { minWidth: '24px', textAlign: 'center', fontWeight: 'var(--font-weight-bold)' } }, String(value)),
        iconButton('plus', { onClick: () => onChange(clamp(value + 1, min, max)), ariaLabel: `${label}: больше` })
      )

    return h(
      'div',
      {},
      meterButton,
      h(
        'div',
        { className: 'card', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' } },
        stepRow('Долей в такте', beat.beatsPerBar, (v) => setMeter(v, beat.beatDivision), MIN_BEATS_PER_BAR, MAX_BEATS_PER_BAR),
        stepRow('Деление доли', beat.beatDivision, (v) => setMeter(beat.beatsPerBar, v), MIN_BEAT_DIVISION, MAX_BEAT_DIVISION),
        button('Готово', { variant: 'accent', onClick: () => { showMeterEditor = false; render() } })
      )
    )
  }

  function render() {
    const beat = currentBeat()
    if (!beat) {
      mount(container, h('p', {}, 'Бит не найден.'))
      return
    }
    const totalSteps = totalStepsOf(beat)
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
    // Группа = одна доля (beatDivision ударов). Чередующаяся заливка, чтобы
    // границы долей были видны в сетке, а не только в бейдже над ней.
    const isEvenGroup = (stepIndex: number) => Math.floor(stepIndex / beat.beatDivision) % 2 === 0

    grid.append(h('div', {}))
    for (let i = 0; i < totalSteps; i++) {
      grid.append(
        h(
          'div',
          {
            style: {
              textAlign: 'center',
              fontSize: 'var(--font-size-caption)',
              color: 'var(--color-text-muted)',
              backgroundColor: isEvenGroup(i) ? undefined : 'var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            },
          },
          String(i + 1)
        )
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
              backgroundColor: active ? DRUM_ROLE_COLORS[track.role] : isEvenGroup(stepIndex) ? undefined : 'var(--color-border)',
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
        renderMeter(beat),
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
