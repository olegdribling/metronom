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

// Библиотека битов/брейков (личная, локальная — data/beatsLibrary.ts).
// Дорожка хранит РОЛЬ барабана, а не сэмпл напрямую — сэмпл резолвится через
// DRUM_KITS (config.ts) при проигрывании, см. data/resolveBeat.ts. Так выбор
// кита позже не потребует переделки этой модели.
// DrumRole живёт здесь (не в config.ts), потому что types.ts ни от чего не
// зависит (см. шапку файла) — DRUM_ROLES (сам список для перебора в UI) и
// DRUM_KITS — в config.ts, типизированы через этот тип.
export type DrumRole = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'tom3' | 'crash' | 'ride'

export type BeatKind = 'beat' | 'break'

export interface BeatTrack {
  role: DrumRole
  steps: boolean[]
}

export interface Beat {
  id: string
  kind: BeatKind
  name: string
  /** Длина бита в шагах (столбцах сетки), 1..BEAT_MAX_STEPS — свободная, как
   * в референсе (realdrummetronome.com/editor): столбцы добавляются и
   * удаляются по одному, такт — только разметка сетки (beatsPerBar ×
   * beatDivision шагов), последний такт может быть неполным. Раньше длина
   * хранилась целыми тактами (`bars`) — старые биты мигрирует
   * normalizeBeat() (data/beatsLibrary.ts). Всегда равна track.steps.length. */
  steps: number
  /** Долей в такте — как «Metrum» у кольца метронома (metronomeScreen.ts).
   * По умолчанию 1 — одна доля на такт. */
  beatsPerBar: number
  /** Ударов на долю — как «деление доли» у кольца метронома. По умолчанию
   * 4 — итоговый размер по умолчанию 1/4 (один такт = 4 удара). */
  beatDivision: number
  /** id кита из DRUM_KITS (config.ts) — свой на каждый бит, не общий на
   * приложение, как и steps/beatsPerBar/beatDivision. */
  kitId: string
  tracks: BeatTrack[]
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
  /** Позиция внутри текущей доли, 0..beatDivision-1 — для кольца метронома
   * (крупные точки = доли, мелкие = деление доли). Не связано с patternStep. */
  subBeat: number
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
