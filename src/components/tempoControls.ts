// Темп и размер такта — одни и те же элементы на метрономе (в центре
// кольца), в строке темпа песни и в редакторе бита (Правила
// проектирования, п.3: один смысл — один вид). Что они правят, решает экран:
// у метронома, песни и бита всё своё (решение пользователя).
//
// Поле темпа держит черновик ввода у себя, а не в поле: экран
// перерисовывается целиком на любое изменение состояния (в том числе
// снимок Firestore посреди ввода), mount() вернёт фокус и курсор новому
// полю по ключу, а черновик — из замыкания (см. «Построение DOM» в
// CLAUDE.md).
import { h, isRemounting, keepDigits } from '../dom.ts'
import { button, iconButton } from './button.ts'
import { Meter } from '../types.ts'

export interface TempoFieldOptions {
  /** Ключ поля ввода (data-key) — уникальный на экране. */
  key: string
  get(): number
  set(bpm: number): void
  /** Перерисовать место, где стоит поле (открыть/закрыть ввод). */
  rerender(): void
  buttonClass: string
  inputClass: string
}

export interface TempoField {
  render(): HTMLElement
}

export function createTempoField(opts: TempoFieldOptions): TempoField {
  // null — не вводят, показывается кнопка с числом.
  let draft: string | null = null

  function commit() {
    if (draft === null) return
    const value = draft
    draft = null
    // Пустое поле — оставить темп как был, а не уронить его до минимума.
    if (value.trim() === '') opts.rerender()
    else opts.set(Number(value))
  }

  function open() {
    draft = String(opts.get())
    opts.rerender()
    const input = document.querySelector<HTMLInputElement>(`[data-key="${CSS.escape(opts.key)}"]`)
    input?.focus()
    input?.select()
  }

  return {
    render() {
      if (draft === null) {
        return h('button', { type: 'button', className: opts.buttonClass, onClick: open }, String(opts.get()))
      }
      return h('input', {
        type: 'text',
        className: opts.inputClass,
        key: opts.key,
        inputMode: 'numeric',
        autocomplete: 'off',
        value: draft,
        onInput: (e: Event) => (draft = keepDigits(e.target as HTMLInputElement, 3)),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            draft = null
            opts.rerender()
          }
        },
        // Не во время перерисовки: старое поле уходит из DOM, и браузер шлёт
        // ему blur — недописанное «14» на пути к «140» не должно применяться.
        onChange: () => !isRemounting() && commit(),
        onBlur: () => !isRemounting() && commit(),
      })
    },
  }
}

export interface MeterFieldOptions {
  get(): Meter
  /** Новый размер — в пределы его приводит тот, кто хранит. */
  set(meter: Meter): void
  rerender(): void
  /** Панель под бейджем — по центру (кольцо) или к правому краю (строка
   * темпа песни у края экрана). */
  align?: 'center' | 'end'
}

export interface MeterField {
  render(): HTMLElement
}

// Бейдж «N/M» (.dial__meter): тап — панель с «Долей в такте» и «Деление
// доли».
export function createMeterField(opts: MeterFieldOptions): MeterField {
  let open = false
  const toggle = (next: boolean) => {
    open = next
    opts.rerender()
  }

  const stepRow = (label: string, value: number, onChange: (v: number) => void) =>
    h(
      'div',
      { className: 'row row--3' },
      h('span', { className: 'grow text-small text-sub' }, label),
      iconButton('minus', { onClick: () => onChange(value - 1), ariaLabel: `${label}: меньше` }),
      h('span', { className: 'stepper-value' }, String(value)),
      iconButton('plus', { onClick: () => onChange(value + 1), ariaLabel: `${label}: больше` })
    )

  return {
    render() {
      const meter = opts.get()
      const badge = h(
        'button',
        { type: 'button', className: 'dial__meter', onClick: () => toggle(!open) },
        `${meter.beatsPerBar}/${meter.beatDivision}`
      )
      if (!open) return h('div', { className: 'dial__meter-anchor' }, badge)
      return h(
        'div',
        { className: 'dial__meter-anchor' },
        badge,
        h(
          'div',
          { className: `card stack dial__meter-editor${opts.align === 'end' ? ' dial__meter-editor--end' : ''}` },
          stepRow('Долей в такте', meter.beatsPerBar, (v) => opts.set({ ...meter, beatsPerBar: v })),
          stepRow('Деление доли', meter.beatDivision, (v) => opts.set({ ...meter, beatDivision: v })),
          button('Готово', { variant: 'accent', onClick: () => toggle(false) })
        )
      )
    },
  }
}
