// Пределы значений, общие для песни, бита и метронома: темп, размер такта.
import { CONFIG, DEFAULT_METER } from '../config.ts'
import { Meter } from '../types.ts'

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

export const clampBpm = (value: unknown): number => clampInt(value, CONFIG.MIN_BPM, CONFIG.MAX_BPM, CONFIG.DEFAULT_BPM)

export function clampMeter(meter: Partial<Meter>): Meter {
  return {
    beatsPerBar: clampInt(meter.beatsPerBar, CONFIG.MIN_BEATS_PER_BAR, CONFIG.MAX_BEATS_PER_BAR, DEFAULT_METER.beatsPerBar),
    beatDivision: clampInt(meter.beatDivision, CONFIG.MIN_BEAT_DIVISION, CONFIG.MAX_BEAT_DIVISION, DEFAULT_METER.beatDivision),
  }
}
