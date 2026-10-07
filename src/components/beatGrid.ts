// Сетка редактора бита (screens/beatEditorScreen.ts) — повторяет сетку
// референса realdrummetronome.com/editor и её поведение (изучено вживую и по
// их исходнику):
//   - лента столбцов фиксированного размера с горизонтальной прокруткой и
//     затуханием по краям; такты — вертикальные линии + номер над серединой;
//   - тап по клетке — нота вкл/выкл (и снимает выделение); тап по
//     «призрачному» столбцу за концом удлиняет бит до него;
//   - выделение — ПРЯМОУГОЛЬНИК (строки × шаги): мышью — протянуть, на
//     тачскрине — подержать 350ms и вести (просто провести — прокрутка);
//     у краёв ленты при выделении она сама прокручивается;
//   - тулбар над выделением: копировать / копия влево / копия вправо /
//     залить строки / отмена (Esc, ⌘C, Enter — с клавиатуры);
//   - вставка: полупрозрачный блок за курсором (на любые строки), клик —
//     вставить (на тачскрине: тап — сдвинуть, кнопка — вставить), можно
//     вставлять много раз до отмены; красная рамка — не помещается.
//
// В отличие от остального приложения, сетка НЕ пересоздаётся целиком на
// каждую перерисовку экрана: это один живой элемент (el), экран лишь
// передаёт ему свежий бит через update(). Иначе на каждый тап терялись бы
// прокрутка ленты и захват указателя (setPointerCapture) посреди выделения.
// Сами правки сетка не сохраняет — отдаёт новый бит через onEdit(), экран
// сохраняет и возвращает его обратно через update().
//
// Закрытый замок страницы (setLocked) — сетку можно смотреть, листать и
// слушать иконки строк, но не править: клетки не нажимаются, кнопки
// добавления и удаления неактивны.
import { h } from '../dom.ts'
import { icon } from '../icons.ts'
import { drumIcon } from './drumIcons.ts'
import { BEAT_MAX_STEPS, DRUM_ROLES, DRUM_ROLE_COLORS, DRUM_ROLE_LABELS } from '../config.ts'
import { Beat, BeatTrack, DrumRole } from '../types.ts'

// Геометрия — как у референса. Те же числа в .beat-grid* (components.css):
// столбец 44px (клетка 40 + поля по 2), строка 32px (клетка 30 + поля по 1).
const COL_W = 44
const ROW_H = 32
const LONG_PRESS_MS = 350
const TOUCH_SLOP_PX = 8
const EDGE_ZONE_PX = 36
const EDGE_SCROLL_PX = 8

export type Cell = { column: number; row: number }
export type Region = Cell & { width: number; height: number }
/** Скопированный блок: размер + включённые клетки в координатах блока ("c:r"). */
export type Clipboard = { width: number; height: number; hits: Set<string> }

interface Drag {
  pointerId: number
  start: Cell
  clientX: number
  clientY: number
  moved: boolean
  touch: boolean
  /** Тач: выделение началось только после удержания (LONG_PRESS_MS). */
  selecting: boolean
}

export interface BeatGridEdit {
  steps: number
  tracks: BeatTrack[]
}

export interface BeatGridOptions {
  onEdit(edit: BeatGridEdit): void
  /** «+» под иконками — добавить строку (выбор роли — на стороне экрана). */
  onAddRow(): void
  onRemoveRow(index: number): void
  /** Проиграть звук роли — тап по иконке и включение ноты в клетке. */
  onPreviewRole(role: DrumRole): void
}

export interface BeatGrid {
  el: HTMLElement
  update(beat: Beat): void
  /** Подсветка играющего шага — горячий путь, напрямую в DOM. */
  setPlayhead(step: number | null): void
  /** Закрыт замок страницы — только смотреть. */
  setLocked(locked: boolean): void
  scrollToStart(): void
  destroy(): void
}

const cellKey = (column: number, row: number) => `${column}:${row}`
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const resized = (steps: boolean[], length: number) => Array.from({ length }, (_, i) => !!steps[i])

export function captureRegion(tracks: BeatTrack[], region: Region): Clipboard {
  const hits = new Set<string>()
  for (let c = 0; c < region.width; c++) {
    for (let r = 0; r < region.height; r++) {
      if (tracks[region.row + r]?.steps[region.column + c]) hits.add(cellKey(c, r))
    }
  }
  return { width: region.width, height: region.height, hits }
}

// Куда ляжет блок, если поставить его левым верхним углом в `at`. По
// вертикали обязан влезть целиком (иначе null — красная рамка), по
// горизонтали обрезается началом бита и пределом BEAT_MAX_STEPS — как у
// референса (копия влево у начала кладёт только то, что влезло).
export function fitRegion(clip: { width: number; height: number }, at: Cell, rows: number): Region | null {
  if (at.column + clip.width <= 0 || at.column >= BEAT_MAX_STEPS || at.row < 0 || at.row + clip.height > rows) return null
  const column = Math.max(0, at.column)
  return { column, row: at.row, width: Math.min(at.column + clip.width, BEAT_MAX_STEPS) - column, height: clip.height }
}

// Вставка перезаписывает весь прямоугольник, включая пустые клетки блока,
// и может удлинить бит (вставка/копия вправо за концом).
export function pasteBlock(beat: Beat, clip: Clipboard, at: Cell): { edit: BeatGridEdit; region: Region } | null {
  const region = fitRegion(clip, at, beat.tracks.length)
  if (!region) return null
  const steps = Math.max(beat.steps, region.column + region.width)
  const tracks = beat.tracks.map((t, r) => {
    const next = resized(t.steps, steps)
    if (r >= region.row && r < region.row + region.height) {
      for (let c = region.column; c < region.column + region.width; c++) {
        next[c] = clip.hits.has(cellKey(c - at.column, r - at.row))
      }
    }
    return { ...t, steps: next }
  })
  return { edit: { steps, tracks }, region }
}

// «Залить строки» — повторить блок по всей длине бита в выбранных строках
// (в обе стороны от выделения, с сохранением фазы), включая пустые клетки.
export function fillRows(beat: Beat, region: Region): BeatGridEdit {
  const clip = captureRegion(beat.tracks, region)
  const tracks = beat.tracks.map((t, r) => {
    if (r < region.row || r >= region.row + region.height) return t
    const phase = (c: number) => (((c - region.column) % clip.width) + clip.width) % clip.width
    return { ...t, steps: t.steps.map((_, c) => clip.hits.has(cellKey(phase(c), r - region.row))) }
  })
  return { steps: beat.steps, tracks }
}

// Прокрутить ленту так, чтобы region был виден (не дёргая, если уже виден).
function revealScroll(scrollLeft: number, width: number, region: { column: number; width: number }): number {
  const start = COL_W * region.column
  const end = start + COL_W * region.width
  if (start >= scrollLeft && end <= scrollLeft + width) return scrollLeft
  if (end - start > width) return start <= scrollLeft && end >= scrollLeft + width ? scrollLeft : start
  return start < scrollLeft ? start : Math.max(0, end - width)
}

// Сила затухания края ленты (0..1) по тому, сколько ещё можно прокрутить.
const fadeStrength = (px: number) => {
  const t = clamp(px / 48, 0, 1)
  return t * t * (3 - 2 * t)
}

function toolButton(iconNames: string[], label: string, onClick: () => void, opts: { wide?: boolean; disabled?: boolean; title?: string } = {}) {
  return h(
    'button',
    {
      type: 'button',
      className: `beat-grid__tool${opts.wide ? ' beat-grid__tool--wide' : ''}`,
      'aria-label': label,
      title: opts.title ?? label,
      disabled: opts.disabled,
      onClick: opts.disabled ? undefined : onClick,
    },
    ...iconNames.map((name) => icon(name))
  )
}

export function createBeatGrid(opts: BeatGridOptions): BeatGrid {
  let beat: Beat | null = null
  let selection: Region | null = null
  let clipboard: Clipboard | null = null
  let preview: Cell | null = null
  // «Активная» клетка — последняя нажатая: светится, её столбец подсвечен.
  let active: Cell = { column: 0, row: 0 }
  let drag: Drag | null = null
  let suppressClick = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let dragging = false
  let edgeRaf: number | null = null
  let isTouch = window.matchMedia('(pointer: coarse)').matches
  let playhead: number | null = null
  let visibleColumns = 0
  let columnEls: HTMLElement[] = []
  let rolesKey = ''
  let pendingReveal: Region | null = null
  // Столбец активной клетки, который уже показали прокруткой (см. update()).
  let revealedColumn = -1
  let locked = false

  const rolesEl = h('div', { className: 'beat-grid__roles' })
  const selectionEl = h('div', { className: 'beat-grid__selection', hidden: true })
  const toolbarEl = h('div', { className: 'beat-grid__toolbar', role: 'toolbar', hidden: true })
  const surface = h('div', { className: 'beat-grid__surface', tabindex: '0', 'aria-label': 'Сетка бита' })
  const viewport = h('div', { className: 'beat-grid__viewport' }, surface)
  const rowActionsEl = h('div', { className: 'beat-grid__row-actions' })
  const addColumnButton = h(
    'button',
    { type: 'button', className: 'beat-grid__add-col', 'aria-label': 'Добавить шаг', title: 'Добавить шаг', onClick: () => addColumn() },
    icon('plus')
  )
  const countEl = h('div', { className: 'beat-grid__count' })
  const addColumnWrap = h('div', { className: 'beat-grid__add-col-wrap' }, addColumnButton, countEl)
  const el = h('div', { className: 'beat-grid' }, rolesEl, viewport, rowActionsEl, addColumnWrap)

  const rows = () => beat?.tracks.length ?? 0

  // --- раскладка ---

  function totalColumns(): number {
    if (!beat) return 0
    const fitted = clipboard && preview ? fitRegion(clipboard, preview, rows()) : null
    // Призрачные столбцы за концом: до ширины экрана, плюс место под
    // вставку блока за концом бита (как у референса).
    return Math.min(
      BEAT_MAX_STEPS,
      Math.max(beat.steps + (clipboard?.width ?? 0), visibleColumns, fitted ? fitted.column + fitted.width : 0)
    )
  }

  function buildColumn(c: number): HTMLElement {
    const b = beat!
    const isTemplate = c >= b.steps
    // Весь бит — один такт (размер по длине, data/beatMeter.ts), поэтому
    // номеров тактов над лентой нет, а линия такта отмечает только конец
    // бита — границу с призрачными столбцами.
    const col = h('div', {
      className:
        'beat-grid__col' +
        (isTemplate ? ' beat-grid__col--template' : '') +
        (c > 0 && c % b.steps === 0 ? ' beat-grid__col--bar-start' : '') +
        (c === active.column ? ' beat-grid__col--active' : '') +
        (c === playhead ? ' beat-grid__col--playing' : ''),
    })
    // Чередующаяся заливка долей (группа = beatDivision шагов) — наша, у
    // референса её нет.
    const altGroup = Math.floor(c / b.beatDivision) % 2 === 1
    b.tracks.forEach((track, r) => {
      const on = !isTemplate && !!track.steps[c]
      const cell = h('div', {
        className:
          'beat-grid__cell' +
          (on ? ' beat-grid__cell--on' : altGroup ? ' beat-grid__cell--alt' : '') +
          (active.column === c && active.row === r ? ' beat-grid__cell--focus' : ''),
        role: 'button',
        'aria-label': `${DRUM_ROLE_LABELS[track.role]}, шаг ${c + 1}`,
        'aria-pressed': String(on),
        dataset: { cell: cellKey(c, r) },
      })
      if (on) cell.style.setProperty('--cell-color', DRUM_ROLE_COLORS[track.role])
      col.append(cell)
    })
    if (!isTemplate) {
      col.append(
        h(
          'div',
          { className: 'beat-grid__col-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'beat-grid__remove',
              'aria-label': `Удалить шаг ${c + 1}`,
              disabled: locked || b.steps <= 1,
              onClick: () => removeColumn(c),
            },
            icon('trash')
          )
        )
      )
    }
    return col
  }

  function renderColumns() {
    const total = totalColumns()
    columnEls = Array.from({ length: total }, (_, c) => buildColumn(c))
    // Оверлеи — после столбцов: абсолютные, раскладку ленты не трогают.
    surface.replaceChildren(...columnEls, selectionEl, toolbarEl)
  }

  function renderRows() {
    const b = beat!
    rolesEl.replaceChildren(
      ...b.tracks.map((track, r) =>
        h(
          'button',
          {
            type: 'button',
            className: 'beat-grid__role',
            'aria-label': DRUM_ROLE_LABELS[track.role],
            onClick: () => {
              active = { column: active.column, row: r }
              opts.onPreviewRole(track.role)
              renderColumns()
              renderOverlay()
            },
          },
          drumIcon(track.role)
        )
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'beat-grid__role beat-grid__role--add',
          'aria-label': 'Добавить инструмент',
          title: b.tracks.length >= DRUM_ROLES.length ? 'Все инструменты уже добавлены' : 'Добавить инструмент',
          disabled: locked || b.tracks.length >= DRUM_ROLES.length,
          onClick: () => opts.onAddRow(),
        },
        icon('plus')
      )
    )
    rowActionsEl.replaceChildren(
      ...b.tracks.map((track, r) =>
        h(
          'div',
          { className: 'beat-grid__row-action' },
          h(
            'button',
            {
              type: 'button',
              className: 'beat-grid__remove',
              'aria-label': `Удалить ${DRUM_ROLE_LABELS[track.role]}`,
              disabled: locked,
              onClick: () => removeRow(r),
            },
            icon('trash')
          )
        )
      )
    )
  }

  function displayedRegion(): { region: Region; invalid: boolean; clipped: boolean } | null {
    if (clipboard && preview) {
      const fitted = fitRegion(clipboard, preview, rows())
      if (fitted) return { region: fitted, invalid: false, clipped: fitted.width < clipboard.width }
      return {
        region: {
          ...preview,
          width: Math.min(clipboard.width, BEAT_MAX_STEPS - preview.column),
          height: Math.min(clipboard.height, rows() - preview.row),
        },
        invalid: true,
        clipped: false,
      }
    }
    return selection ? { region: selection, invalid: false, clipped: false } : null
  }

  function renderOverlay() {
    const shown = displayedRegion()
    if (!shown || !beat) {
      selectionEl.hidden = true
      toolbarEl.hidden = true
      return
    }
    const { region, invalid, clipped } = shown
    const isPreview = !!clipboard
    selectionEl.hidden = false
    selectionEl.className =
      'beat-grid__selection' + (isPreview ? ' beat-grid__selection--preview' : '') + (invalid ? ' beat-grid__selection--invalid' : '')
    Object.assign(selectionEl.style, {
      left: `${COL_W * region.column}px`,
      top: `${ROW_H * region.row}px`,
      width: `${COL_W * region.width}px`,
      height: `${ROW_H * region.height}px`,
    })
    const ghosts: HTMLElement[] = []
    if (clipboard) {
      for (let c = 0; c < region.width; c++) {
        for (let r = 0; r < region.height; r++) {
          const on = clipboard.hits.has(cellKey(c, r))
          const ghost = h('div', {
            className: `beat-grid__ghost${on ? ' beat-grid__ghost--on' : ''}`,
            style: { left: `${COL_W * c}px`, top: `${ROW_H * r - 1}px` },
          })
          const track = beat.tracks[region.row + r]
          if (on && track) ghost.style.setProperty('--cell-color', DRUM_ROLE_COLORS[track.role])
          ghosts.push(ghost)
        }
      }
    }
    selectionEl.replaceChildren(...ghosts)

    // Пока тянем — тулбар не показываем, чтобы не мешал.
    toolbarEl.hidden = dragging
    if (dragging) return
    if (clipboard) {
      toolbarEl.setAttribute('aria-label', 'Вставка')
      toolbarEl.replaceChildren(
        ...(isTouch
          ? [
              toolButton(['clipboard-text'], clipped ? 'Вставить до предела' : 'Вставить сюда', () => preview && commitPaste(preview), {
                wide: true,
                disabled: invalid,
                title: clipped ? `Вставить столбцы, что влезают в предел ${BEAT_MAX_STEPS}` : 'Вставить сюда',
              }),
            ]
          : []),
        toolButton(['x'], 'Отменить', cancel, { title: 'Отменить (Esc)' })
      )
    } else {
      toolbarEl.setAttribute('aria-label', 'Выделенный диапазон')
      toolbarEl.replaceChildren(
        toolButton(['copy'], 'Копировать', copySelection, { title: 'Копировать (⌘C)' }),
        toolButton(['caret-left', 'copy'], 'Копия влево', () => copyBeside(-1), { wide: true, disabled: region.column <= 0 }),
        toolButton(['copy', 'caret-right'], 'Копия вправо', () => copyBeside(1), {
          wide: true,
          disabled: region.column + region.width >= BEAT_MAX_STEPS,
        }),
        toolButton(['caret-double-left', 'caret-double-right'], 'Залить строки', fillSelection, {
          wide: true,
          title: 'Повторить выделенное по всей длине бита в этих строках',
        }),
        toolButton(['x'], 'Снять выделение', cancel, { title: 'Отменить (Esc)' })
      )
    }
    positionToolbar(region)
  }

  // Над выделением, но в пределах видимой части ленты.
  function positionToolbar(region = displayedRegion()?.region) {
    if (!region || toolbarEl.hidden) return
    const width = toolbarEl.offsetWidth
    const left = clamp(COL_W * region.column, viewport.scrollLeft + 6, viewport.scrollLeft + viewport.clientWidth - width - 6)
    toolbarEl.style.left = `${left}px`
    toolbarEl.style.top = `${ROW_H * region.row - 30}px`
  }

  function updateFade() {
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    viewport.style.setProperty('--fade-l', String(fadeStrength(viewport.scrollLeft)))
    viewport.style.setProperty('--fade-r', String(fadeStrength(maxScroll - viewport.scrollLeft)))
  }

  // Ширина ленты — целое число видимых столбцов (как у референса), чтобы
  // справа не торчал обрезанный столбец.
  function measure() {
    const fixed = rolesEl.offsetWidth + rowActionsEl.offsetWidth + addColumnWrap.offsetWidth
    const columns = Math.max(1, Math.floor((el.clientWidth - fixed) / COL_W))
    el.style.setProperty('--beat-grid-viewport-w', `${columns * COL_W}px`)
    if (columns !== visibleColumns) {
      visibleColumns = columns
      if (beat && totalColumns() !== columnEls.length) renderColumns()
    }
    updateFade()
    positionToolbar()
  }

  // --- правки ---

  function edit(next: BeatGridEdit) {
    opts.onEdit(next)
  }

  function toggle(cell: Cell) {
    const b = beat!
    selection = null
    active = cell
    const steps = Math.max(b.steps, cell.column + 1) // тап по призрачному столбцу удлиняет бит
    const tracks = b.tracks.map((t, r) => {
      const next = resized(t.steps, steps)
      if (r === cell.row) next[cell.column] = !next[cell.column]
      return { ...t, steps: next }
    })
    // Включённая нота сразу звучит — всегда (у референса это переключатель
    // «Play sound on cell click», у нас он не нужен — решение пользователя).
    if (tracks[cell.row].steps[cell.column]) opts.onPreviewRole(b.tracks[cell.row].role)
    edit({ steps, tracks })
  }

  function addColumn() {
    const b = beat!
    if (b.steps >= BEAT_MAX_STEPS) return
    active = { column: b.steps, row: active.row }
    edit({ steps: b.steps + 1, tracks: b.tracks.map((t) => ({ ...t, steps: [...t.steps, false] })) })
  }

  function removeColumn(c: number) {
    const b = beat!
    if (b.steps <= 1) return
    edit({ steps: b.steps - 1, tracks: b.tracks.map((t) => ({ ...t, steps: t.steps.filter((_, i) => i !== c) })) })
  }

  function removeRow(r: number) {
    if (r < active.row) active = { column: active.column, row: active.row - 1 }
    opts.onRemoveRow(r)
  }

  // Вставка из буфера остаётся в режиме вставки — можно вставить ещё раз в
  // другое место; копия влево/вправо (copyBeside) — разовая, без буфера.
  function applyPaste(clip: Clipboard, at: Cell) {
    const result = pasteBlock(beat!, clip, at)
    if (!result) return
    surface.focus({ preventScroll: true })
    selection = result.region
    active = { column: result.region.column, row: result.region.row }
    pendingReveal = result.region
    edit(result.edit)
  }

  function commitPaste(at: Cell) {
    if (clipboard) applyPaste(clipboard, at)
  }

  // Копия вплотную слева/справа; выделение переезжает на новую копию.
  function copyBeside(direction: 1 | -1) {
    if (!selection || !beat) return
    applyPaste(captureRegion(beat.tracks, selection), { column: selection.column + direction * selection.width, row: selection.row })
  }

  function copySelection() {
    if (!selection || !beat) return
    surface.focus({ preventScroll: true })
    clipboard = captureRegion(beat.tracks, selection)
    preview = { column: selection.column, row: selection.row }
    surface.classList.add('beat-grid__surface--pasting')
    renderColumns()
    renderOverlay()
  }

  function fillSelection() {
    if (!selection || !beat) return
    surface.focus({ preventScroll: true })
    edit(fillRows(beat, selection))
  }

  function cancel() {
    surface.focus({ preventScroll: true })
    const hadClipboard = !!clipboard
    resetSelection()
    if (hadClipboard) renderColumns()
    renderOverlay()
  }

  function resetSelection() {
    selection = null
    clipboard = null
    preview = null
    surface.classList.remove('beat-grid__surface--pasting')
  }

  function setPreview(cell: Cell) {
    if (preview && preview.column === cell.column && preview.row === cell.row) return
    preview = cell
    if (totalColumns() !== columnEls.length) renderColumns()
    renderOverlay()
  }

  function selectRange(a: Cell, b: Cell) {
    // Выделять можно только реальные шаги, не призрачные столбцы.
    const last = beat!.steps - 1
    const ac = Math.min(a.column, last)
    const bc = Math.min(b.column, last)
    const next = { column: Math.min(ac, bc), row: Math.min(a.row, b.row), width: Math.abs(bc - ac) + 1, height: Math.abs(b.row - a.row) + 1 }
    const same = selection && (['column', 'row', 'width', 'height'] as const).every((k) => selection![k] === next[k])
    selection = next
    // Тот же прямоугольник при движении внутри клетки — не перерисовываем;
    // но после отпускания (dragging уже false) — обязательно, чтобы
    // появился тулбар.
    if (!same || !dragging) renderOverlay()
  }

  // --- указатель: тап / протянуть / подержать-и-вести ---

  function cellAt(x: number, y: number): Cell | null {
    if (!rows() || !columnEls.length) return null
    const rect = surface.getBoundingClientRect()
    return {
      column: clamp(Math.floor((x - rect.left) / COL_W), 0, columnEls.length - 1),
      row: clamp(Math.floor((y - rect.top) / ROW_H), 0, rows() - 1),
    }
  }

  function clearLongPress() {
    if (longPressTimer !== null) clearTimeout(longPressTimer)
    longPressTimer = null
  }

  function setDragging(next: boolean) {
    dragging = next
    if (next && edgeRaf === null) edgeRaf = requestAnimationFrame(edgeScroll)
    if (!next && edgeRaf !== null) {
      cancelAnimationFrame(edgeRaf)
      edgeRaf = null
    }
    renderOverlay()
  }

  function trackDrag(d: Drag) {
    const cell = cellAt(d.clientX, d.clientY)
    if (!cell) return
    if (cell.column !== d.start.column || cell.row !== d.start.row) d.moved = true
    if (clipboard) setPreview(cell)
    else if (d.moved || d.selecting) selectRange(d.start, cell)
  }

  // Палец/курсор у края ленты при выделении — лента сама едет туда.
  function edgeScroll() {
    const d = drag
    if (d) {
      const rect = viewport.getBoundingClientRect()
      const zone = Math.min(EDGE_ZONE_PX, rect.width / 4)
      const delta = d.clientX < rect.left + zone ? -EDGE_SCROLL_PX : d.clientX > rect.right - zone ? EDGE_SCROLL_PX : 0
      if (delta && d.moved) {
        viewport.scrollLeft += delta
        trackDrag(d)
      }
    }
    edgeRaf = requestAnimationFrame(edgeScroll)
  }

  function finishDrag(e: PointerEvent, cancelled: boolean) {
    const d = drag
    if (!d || d.pointerId !== e.pointerId) return
    clearLongPress()
    drag = null
    suppressClick = true
    if (surface.hasPointerCapture(e.pointerId)) surface.releasePointerCapture(e.pointerId)
    setDragging(false)
    if (cancelled) return
    const cell = cellAt(e.clientX, e.clientY)
    if (!cell) return
    if (clipboard) {
      setPreview(cell)
      if (!d.touch) commitPaste(cell) // мышь — вставка кликом; тач — кнопкой в тулбаре
    } else if (d.moved || d.selecting) {
      selectRange(d.start, cell)
    } else {
      toggle(cell)
    }
  }

  surface.addEventListener('pointerdown', (e) => {
    const target = e.target as Element
    if (locked || !e.isPrimary || e.button !== 0 || drag || !target.closest('[data-cell]')) return
    suppressClick = false
    const touch = e.pointerType === 'touch'
    isTouch = touch
    const start = cellAt(e.clientX, e.clientY)
    if (!start) return
    const d: Drag = { pointerId: e.pointerId, start, clientX: e.clientX, clientY: e.clientY, moved: false, touch, selecting: false }
    drag = d
    if (touch && !clipboard) {
      // Тач: выделение — только после удержания, иначе это прокрутка ленты.
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        if (drag !== d) return
        d.selecting = true
        surface.focus({ preventScroll: true })
        setDragging(true)
        selectRange(start, start)
      }, LONG_PRESS_MS)
      return
    }
    e.preventDefault()
    surface.focus({ preventScroll: true })
    surface.setPointerCapture(e.pointerId)
    setDragging(true)
    if (clipboard) setPreview(start)
  })

  surface.addEventListener('pointermove', (e) => {
    const d = drag
    if (d && d.pointerId === e.pointerId) {
      if (d.touch && !d.selecting && !clipboard) {
        if (Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) > TOUCH_SLOP_PX) {
          clearLongPress()
          drag = null
          suppressClick = true
        }
        return
      }
      d.clientX = e.clientX
      d.clientY = e.clientY
      trackDrag(d)
    } else if (clipboard && (e.target as Element).closest('[data-cell]')) {
      // Режим вставки: блок ходит за курсором и без нажатия.
      const cell = cellAt(e.clientX, e.clientY)
      if (cell) setPreview(cell)
    }
  })

  surface.addEventListener('pointerup', (e) => finishDrag(e, false))
  surface.addEventListener('pointercancel', (e) => finishDrag(e, true))
  surface.addEventListener('lostpointercapture', (e) => finishDrag(e, true))

  // Клик (не указатель) — только клавиатура/вспомогательные технологии:
  // указателем тап уже обработан в pointerup, а click после него глушится.
  surface.addEventListener('click', (e) => {
    const cellEl = (e.target as Element).closest<HTMLElement>('[data-cell]')
    if (!cellEl || locked) return
    if (suppressClick) {
      suppressClick = false
      return
    }
    const [column, row] = cellEl.dataset.cell!.split(':').map(Number)
    if (clipboard) setPreview({ column, row })
    else toggle({ column, row })
  })

  surface.addEventListener('contextmenu', (e) => {
    if ((e.target as Element).closest('[data-cell]')) e.preventDefault()
  })

  // Во время тач-выделения не даём браузеру прокручивать ленту, а второй
  // палец (щипок/прокрутка двумя) отменяет начатый жест.
  const onTouchMove = (e: TouchEvent) => {
    if (drag?.selecting && e.cancelable) e.preventDefault()
  }
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length < 2) return
    clearLongPress()
    drag = null
    suppressClick = true
    setDragging(false)
  }
  surface.addEventListener('touchmove', onTouchMove, { passive: false })
  surface.addEventListener('touchstart', onTouchStart, { passive: true })

  surface.addEventListener('keydown', (e) => {
    if (locked) return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selection && !clipboard) {
      e.preventDefault()
      copySelection()
    }
    if (e.key === 'Enter' && clipboard && preview && e.target === surface) {
      e.preventDefault()
      commitPaste(preview)
    }
  })

  viewport.addEventListener(
    'scroll',
    () => {
      updateFade()
      positionToolbar()
    },
    { passive: true }
  )
  const resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(el)

  return {
    el,
    update(next) {
      // Экран редактора перерисовывается на любое изменение состояния, а
      // бит при этом часто тот же — пересобирать сотни клеток незачем.
      if (next === beat) return
      const prevSteps = beat?.steps ?? next.steps
      beat = next
      const key = next.tracks.map((t) => t.role).join(':')
      // Сменился набор строк или бит укоротился — старое выделение/буфер
      // могут указывать в никуда, сбрасываем (как референс).
      if (key !== rolesKey || next.steps < prevSteps) resetSelection()
      if (key !== rolesKey) {
        rolesKey = key
        renderRows()
      }
      active = { column: clamp(active.column, 0, next.steps - 1), row: clamp(active.row, 0, Math.max(0, rows() - 1)) }
      el.style.setProperty('--beat-grid-rows', String(rows()))
      countEl.textContent = String(next.steps)
      addColumnButton.disabled = locked || next.steps >= BEAT_MAX_STEPS
      addColumnButton.title = next.steps >= BEAT_MAX_STEPS ? `Предел — ${BEAT_MAX_STEPS} шагов` : 'Добавить шаг'
      renderColumns()
      renderOverlay()
      // Новая активная клетка (добавили шаг, вставили блок) — показать её.
      const reveal =
        pendingReveal ?? (active.column !== revealedColumn || next.steps !== prevSteps ? { column: active.column, width: 1 } : null)
      pendingReveal = null
      revealedColumn = active.column
      if (reveal) {
        requestAnimationFrame(() => {
          viewport.scrollLeft = revealScroll(viewport.scrollLeft, viewport.clientWidth, reveal)
          updateFade()
        })
      }
    },
    setPlayhead(step) {
      if (step === playhead) return
      if (playhead !== null) columnEls[playhead]?.classList.remove('beat-grid__col--playing')
      playhead = step
      if (step !== null) columnEls[step]?.classList.add('beat-grid__col--playing')
    },
    setLocked(next) {
      if (next === locked) return
      locked = next
      el.classList.toggle('beat-grid--locked', locked)
      if (!beat) return
      if (locked) {
        clearLongPress()
        drag = null
        setDragging(false)
        resetSelection()
      }
      addColumnButton.disabled = locked || beat.steps >= BEAT_MAX_STEPS
      renderRows()
      renderColumns()
      renderOverlay()
    },
    scrollToStart() {
      viewport.scrollLeft = 0
    },
    destroy() {
      resizeObserver.disconnect()
      clearLongPress()
      if (edgeRaf !== null) cancelAnimationFrame(edgeRaf)
      edgeRaf = null
    },
  }
}
