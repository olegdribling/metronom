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
  /** Сколько шагов звучит на одну долю. Нет — 2 (восьмые), как у паттерна
   * песни (редактор паттерна). У бита — beat.beatDivision (шаг = 1/M доли,
   * data/beatMeter.ts). */
  stepsPerBeat?: number
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
  /** Ударов на долю (M) — как «деление доли» у кольца метронома. Вместе с
   * beatsPerBar (N) — размер бита N/M, определяется по числу столбцов
   * автоматически (data/beatMeter.ts), весь бит — один такт. В песне бит
   * занимает N долей, шаг звучит как 1/M доли. */
  beatDivision: number
  /** id кита из DRUM_KITS (config.ts) — свой на каждый бит, не общий на
   * приложение, как и steps/beatsPerBar/beatDivision. */
  kitId: string
  tracks: BeatTrack[]
}

/** Филл в секции: бит из библиотеки, звучащий с доли `at` (номер доли от
 * начала секции, с 0) на свои N долей вместо грува; обрезается концом
 * секции. */
export interface SectionFill {
  at: number
  beatId: string
}

export interface Section {
  name: string
  bars: number
  comment: string
  intro: boolean
  /** Бит из библиотеки — грув на всю секцию вместо паттерна песни (идёт по
   * кругу от начала секции). Нет — играет паттерн песни. */
  beatId?: string
  fills?: SectionFill[]
  /** Только в копии песни для движка (resolveSongForEngine,
   * data/resolveBeat.ts) — разрешённые паттерны битов. В БД не пишутся:
   * движок про Beat не знает, а в песне хранятся только ссылки. */
  groove?: Pattern
  fillPatterns?: { at: number; pattern: Pattern }[]
}

export interface Song {
  id: number
  name: string
  bpm: number
  sections: Section[]
  pattern: Pattern
}

// Плейлист — список песен в аккаунте пользователя:
// users/{uid}/playlists/{id} (data/userLibrary.ts). Общего доступа по коду
// пока нет — отложено отдельной задачей.
export interface Playlist {
  id: string
  name: string
  songs: Song[]
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
  beatId?: string
}
