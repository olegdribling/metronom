// Общие типы данных приложения. Простые данные, ни от чего не зависят —
// перенесены из v1 почти без изменений (см. metronom-v2-plan.md, раздел
// «Перенос кода»).

export type ThemeKey = 'minimal'
// Позже сюда добавятся 'light' | 'dark' — сам механизм (CSS-переменные,
// см. src/design/tokens.css) уже на это рассчитан, добавление темы не
// требует переделки компонентов.

export interface PatternTrack {
  id: string
  name: string
  color: string
  sample: string
  steps: boolean[]
}

export interface Pattern {
  steps: number
  tracks: PatternTrack[]
}

export interface Section {
  name: string
  bars: number
  comment: string
  intro: boolean
}

export interface Song {
  id: number
  name: string
  bpm: number
  sections: Section[]
  pattern: Pattern
}

// Плейлист — единица совместного доступа: один shareable-код, внутри —
// список песен. Живёт в Firestore как playlists/{code}.
export interface Playlist {
  code: string
  songs: Song[]
  updatedAt: number
}

export interface PlaybackState {
  beat: number
  bar: number
  patternStep: number
  nextSectionName: string | null
}

export interface SectionRange {
  start: number
  end: number
}

export interface SectionFormData {
  name: string
  bars: number
  comment: string
}
