// Размер бита «доли × удары» (N/M — N долей по M клеток) определяется по
// числу столбцов автоматически: весь бит — один такт (решение пользователя).
// Правило: делится на 4 → по 4 удара на долю; иначе на 3 → по 3; иначе
// доли — наименьший простой множитель (простое число → одна доля):
// 4 = 1/4, 6 = 2/3, 8 = 2/4, 10 = 2/5, 16 = 4/4, 9 = 3/3, 7 = 1/7.
// Ударов на долю — не больше MAX_BEAT_DIVISION (8, как у кольца метронома):
// иначе N долей по одному удару — 11 = 11/1, 22 = 22/1, 127 = 127/1, а не
// 127 ударов в одну долю (решение пользователя).
// Кратные 12 неоднозначны (12 = 3/4 или 4/3) — выбирает пользователь
// переключателем в редакторе; по умолчанию N/4.
//
// Размер задаёт, сколько долей песни бит занимает (N) и на сколько частей
// делится доля (M): шаг бита звучит как 1/M доли (Pattern.stepsPerBeat).
import { CONFIG } from '../config.ts'
import type { Meter } from '../types.ts'

export type BeatMeter = Meter

function smallestPrimeFactor(n: number): number {
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return p
  return n
}

export function meterOptions(steps: number): BeatMeter[] {
  const n = Math.max(1, Math.floor(steps))
  if (n % 12 === 0) return [{ beatsPerBar: n / 4, beatDivision: 4 }, { beatsPerBar: n / 3, beatDivision: 3 }]
  if (n % 4 === 0) return [{ beatsPerBar: n / 4, beatDivision: 4 }]
  if (n % 3 === 0) return [{ beatsPerBar: n / 3, beatDivision: 3 }]
  const p = smallestPrimeFactor(n)
  const meter = p === n ? { beatsPerBar: 1, beatDivision: n } : { beatsPerBar: p, beatDivision: n / p }
  return meter.beatDivision > CONFIG.MAX_BEAT_DIVISION ? [{ beatsPerBar: n, beatDivision: 1 }] : [meter]
}

// Размер для длины: текущий, если он среди допустимых (так сохраняется
// выбор пользователя для кратных 12), иначе первый вариант.
export function fitMeter(steps: number, current?: Partial<BeatMeter>): BeatMeter {
  const options = meterOptions(steps)
  return (
    options.find((o) => o.beatsPerBar === current?.beatsPerBar && o.beatDivision === current?.beatDivision) ?? options[0]
  )
}
