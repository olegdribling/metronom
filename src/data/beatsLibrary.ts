// Личная библиотека битов/брейков — только на этом устройстве, без Firestore
// (в отличие от песен). Разовая передача другому человеку — через
// data/sharedBeatApi.ts (код, не постоянная синхронизация).
import { Beat } from '../types.ts'

const STORAGE_KEY = 'metronom_beats'

export function getBeats(): Beat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Beat[]) : []
  } catch {
    return []
  }
}

export function saveBeats(beats: Beat[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(beats))
}
