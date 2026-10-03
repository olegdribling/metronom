// Личная библиотека битов/брейков — только на этом устройстве, без Firestore
// (в отличие от песен). Разовая передача другому человеку — через
// data/sharedBeatApi.ts (код, не постоянная синхронизация).
import { Beat } from '../types.ts'
import { BEAT_MAX_STEPS } from '../config.ts'

const STORAGE_KEY = 'metronom_beats'

// Биты, сохранённые до перехода на свободную длину, хранили её целыми
// тактами (`bars`), а не шагами — пересчитываем в steps и выравниваем
// track.steps под неё. Применяется и к локальной библиотеке, и к битам,
// полученным по коду (sharedBeatApi.ts) — там тоже могут лежать старые.
export function normalizeBeat(raw: Beat & { bars?: number }): Beat {
  const { bars, ...beat } = raw
  const beatsPerBar = beat.beatsPerBar || 1
  const beatDivision = beat.beatDivision || 4
  const fromBars = (bars || 1) * beatsPerBar * beatDivision
  const steps = Math.min(BEAT_MAX_STEPS, Math.max(1, beat.steps || fromBars))
  return {
    ...beat,
    beatsPerBar,
    beatDivision,
    steps,
    tracks: beat.tracks.map((t) => ({
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

export function getBeats(): Beat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Beat[]).map(normalizeBeat) : []
  } catch {
    return []
  }
}

export function saveBeats(beats: Beat[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(beats))
}
