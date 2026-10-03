// Иконки ролей барабана для строк сетки редактора бита (components/beatGrid.ts)
// — как у референса (realdrummetronome.com/editor), где строка подписана
// рисунком инструмента, а не текстом. В Phosphor (icons.ts) отдельных
// бочки/малого/томов/тарелок нет — поэтому свои SVG, в той же манере
// (контур, currentColor, скруглённые концы), рисуются по ширине строки.
import { h } from '../dom.ts'
import { DRUM_ROLE_LABELS } from '../config.ts'
import { DrumRole } from '../types.ts'

// Том с номером внутри корпуса — три тома одинаковой формы иначе не
// различить; напольный (3) — ещё и на ножках.
const tom = (n: number, legs = false) => `
  <ellipse cx="12" cy="7" rx="7.5" ry="2.6"/>
  <path d="M4.5 7v8.5c0 1.5 3.4 2.7 7.5 2.7s7.5-1.2 7.5-2.7V7"/>
  ${legs ? '<path d="M6 17.2 5 21.5M18 17.2l1 4.3"/>' : '<path d="M12 18.2v3.3"/>'}
  <text x="12" y="15.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none">${n}</text>`

const SHAPES: Record<DrumRole, string> = {
  // Бас-бочка анфас: пластик, логотип-порт, шпоры по бокам.
  kick: `
    <circle cx="12" cy="11.5" r="8.5"/>
    <circle cx="12" cy="11.5" r="3.2"/>
    <path d="M5.6 17.4 3.8 21.5M18.4 17.4l1.8 4.1"/>`,
  // Малый сбоку: невысокий цилиндр со стойками натяжения.
  snare: `
    <ellipse cx="12" cy="8" rx="9" ry="3"/>
    <path d="M3 8v7.5c0 1.7 4 3 9 3s9-1.3 9-3V8"/>
    <path d="M7 10.8v6.9M12 11v7.5M17 10.8v6.9"/>`,
  // Хай-хэт: две сомкнутые тарелки на стойке.
  hihat: `
    <ellipse cx="12" cy="7.2" rx="9" ry="1.7"/>
    <ellipse cx="12" cy="10.2" rx="9" ry="1.7"/>
    <path d="M12 3v2.8M12 11.9v9.1M8 21.5l4-3.2 4 3.2"/>`,
  tom1: tom(1),
  tom2: tom(2),
  tom3: tom(3, true),
  // Крэш: наклонённая тарелка (её бьют вскользь) на стойке.
  crash: `
    <ellipse cx="12" cy="7.5" rx="9" ry="1.9" transform="rotate(-14 12 7.5)"/>
    <path d="M12 9.6V21M8 21.5l4-3 4 3"/>
    <path d="M3 2.8l1.6 1.4M20.6 1.8 19.4 3.4"/>`,
  // Райд: большая плоская тарелка с выраженным куполом.
  ride: `
    <ellipse cx="12" cy="8.2" rx="10" ry="2"/>
    <path d="M9.6 6.5a2.4 1.6 0 0 1 4.8 0"/>
    <path d="M12 10.2V21M8 21.5l4-3 4 3"/>`,
}

export function drumIcon(role: DrumRole): HTMLElement {
  const el = h('span', { className: 'drum-icon', title: DRUM_ROLE_LABELS[role] })
  // Статичная разметка из SHAPES выше, без пользовательских данных.
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[role]}</svg>`
  return el
}
