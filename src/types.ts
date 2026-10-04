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

// Библиотека битов/брейков — в аккаунте пользователя (data/userLibrary.ts).
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
  /** Темп, с которым бит играет в своём редакторе, — свой у каждого бита
   * (страницы не влияют друг на друга, решение пользователя). BPM — доли,
   * как в песне. В песне бит играет в темпе песни. Старым битам —
   * CONFIG.DEFAULT_BPM (normalizeBeat). */
  bpm: number
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
  /** Стабильный id секции внутри песни — по нему экран песни помнит, какую
   * секцию правят и где открыт выбор филла (индексы сдвигаются при
   * удалении/перетаскивании и при правке с другого устройства). У секций,
   * сохранённых до появления id, его даёт normalizeSong() (data/songs.ts). */
  id: string
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
  /** Размер такта песни — как у кольца метронома: долей в такте и деление
   * доли. Открыли песню — метроном переключился на него (app.ts). Старым
   * песням normalizeSong() (data/songs.ts) ставит 4/4. */
  beatsPerBar: number
  beatDivision: number
  sections: Section[]
  pattern: Pattern
}

// Плейлист в аккаунте пользователя: users/{uid}/playlists/{id}, песни —
// отдельными документами в его подколлекции songs (data/userLibrary.ts).
// Общего доступа по коду пока нет — отложено отдельной задачей.
export interface PlaylistInfo {
  id: string
  name: string
}

export interface PlaybackState {
  beat: number
  bar: number
  /** Позиция внутри текущей доли, 0..beatDivision-1 — для кольца метронома
   * (крупные точки = доли, мелкие = деление доли). Не связано с patternStep. */
  subBeat: number
  /** Шаг паттерна песни на этой доле; -1 — играет не паттерн песни (бит или
   * филл секции, пауза, щелчок). */
  patternStep: number
}

/** Размер такта: долей в такте × деление доли (кольцо метронома, песня). */
export interface Meter {
  beatsPerBar: number
  beatDivision: number
}

/** Настройки страницы «Метроном» — свои, ни на что не влияют и не зависят от
 * песен и битов; запоминаются между запусками (state/appState.ts). */
export interface MetronomeSettings extends Meter {
  /** Темп — скорость КАЖДОЙ точки кольца, крупной и мелкой (решение
   * пользователя): 120 — удар раз в 0,5 с, круг 4/4 из 16 точек — 8 с. В
   * песнях и битах BPM — доля (крупная точка). */
  bpm: number
  /** «Считать вслух вместо клика»: крупная точка — номер доли, мелкие —
   * номер внутри доли (one, two, three, four, two, two, three, four, …). */
  voiceCount: boolean
  /** «Включить мигание»: круг вспыхивает на каждый удар. Выключено — вместо
   * вспышки по точкам прыжками ходит стрелка (точки закрашиваются как
   * обычно). По умолчанию выключено (решение пользователя). */
  flash: boolean
}

/** Что играет страница: у метронома, песни (и её паттерна), бита — свой
 * звук (app.ts). У списков и настроек звука нет. */
export type PlaybackSource = { kind: 'metronome' } | { kind: 'song'; songId: number } | { kind: 'beat'; beatId: string }

export interface SectionFormData {
  name: string
  bars: number
  comment: string
  beatId?: string
}
