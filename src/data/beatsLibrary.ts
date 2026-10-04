// Помощники для битов библиотеки. Сами биты хранятся в аккаунте
// пользователя — users/{uid}/beats/{id} (data/userLibrary.ts).
import { Beat, BeatKind, BeatTrack, DrumRole } from '../types.ts'
import { BEAT_MAX_STEPS, CONFIG, DEFAULT_KIT_ID, DRUM_KITS, DRUM_ROLES } from '../config.ts'
import { fitMeter } from './beatMeter.ts'
import { clampBpm } from './limits.ts'

// Новый бит: один такт 1/4 — дальше длина наращивается в редакторе по
// одному столбцу; сразу с тремя дорожками — самый частый стартовый набор.
// Им же начинается паттерн новой песни (data/songs.ts).
const EMPTY_BEAT_ROLES: DrumRole[] = ['hihat', 'snare', 'kick']

export function createEmptyBeat(id: string, name: string, kind: BeatKind = 'beat'): Beat {
  return {
    id,
    kind,
    name,
    steps: 4,
    beatsPerBar: 1,
    beatDivision: 4,
    kitId: DEFAULT_KIT_ID,
    bpm: CONFIG.DEFAULT_BPM,
    tracks: EMPTY_BEAT_ROLES.map((role) => ({ role, steps: [false, false, false, false] })),
  }
}

// Приводит бит из БД к актуальной модели: длина в шагах в пределах
// 1..BEAT_MAX_STEPS, track.steps ровно такой длины, размер — по длине
// (data/beatMeter.ts), кит и роли — только существующие (иначе резолв в
// resolveBeat.ts упал бы на неизвестной роли). Старые биты хранили длину
// целыми тактами (`bars`) — пересчитываем в steps.
export function normalizeBeat(raw: Partial<Beat> & { id: string; bars?: number }): Beat {
  const beatsPerBar = raw.beatsPerBar || 1
  const beatDivision = raw.beatDivision || 4
  const fromBars = (raw.bars || 1) * beatsPerBar * beatDivision
  const steps = Math.min(BEAT_MAX_STEPS, Math.max(1, Math.floor(raw.steps || fromBars)))
  const tracks: BeatTrack[] = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .filter((t) => !!t && DRUM_ROLES.includes(t.role))
    .map((t) => ({
      role: t.role,
      steps: Array.from({ length: steps }, (_, i) => !!(Array.isArray(t.steps) && t.steps[i])),
    }))
  return {
    id: raw.id,
    kind: raw.kind === 'break' ? 'break' : 'beat',
    name: (typeof raw.name === 'string' && raw.name.slice(0, CONFIG.MAX_NAME_LENGTH)) || 'Бит',
    kitId: DRUM_KITS.some((k) => k.id === raw.kitId) ? raw.kitId! : DEFAULT_KIT_ID,
    bpm: clampBpm(raw.bpm),
    ...fitMeter(steps, { beatsPerBar, beatDivision }),
    steps,
    tracks,
  }
}
