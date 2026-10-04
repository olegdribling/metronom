// Помощники для битов библиотеки. Сами биты хранятся в аккаунте
// пользователя — users/{uid}/beats/{id} (data/userLibrary.ts).
import { Beat } from '../types.ts'
import { BEAT_MAX_STEPS } from '../config.ts'
import { fitMeter } from './beatMeter.ts'

// Приводит бит из БД к актуальной модели: длина в шагах в пределах
// 1..BEAT_MAX_STEPS, track.steps ровно такой длины, размер — по длине
// (data/beatMeter.ts). Старые биты хранили длину целыми тактами (`bars`) —
// пересчитываем в steps.
export function normalizeBeat(raw: Beat & { bars?: number }): Beat {
  const { bars, ...beat } = raw
  const beatsPerBar = beat.beatsPerBar || 1
  const beatDivision = beat.beatDivision || 4
  const fromBars = (bars || 1) * beatsPerBar * beatDivision
  const steps = Math.min(BEAT_MAX_STEPS, Math.max(1, beat.steps || fromBars))
  return {
    ...beat,
    ...fitMeter(steps, { beatsPerBar, beatDivision }),
    steps,
    tracks: (beat.tracks ?? []).map((t) => ({
      ...t,
      steps: Array.from({ length: steps }, (_, i) => !!t.steps[i]),
    })),
  }
}

// Сколько тактов (beatsPerBar × beatDivision шагов) занимает бит — с
// округлением вверх: длина свободная, последний такт может быть неполным.
export function beatBarCount(beat: Beat): number {
  return Math.max(1, Math.ceil(beat.steps / (beat.beatsPerBar * beat.beatDivision)))
}
