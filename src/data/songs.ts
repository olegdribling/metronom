// Песня как данные: приведение к актуальной модели при чтении из БД и чистые
// расчёты по песне, общие для экранов (screens/songScreen.ts,
// metronomeScreen.ts) и состояния (state/appState.ts).
import { CONFIG, DEFAULT_KIT_ID, DEFAULT_METER, PATTERN_STEPS } from '../config.ts'
import { Beat, DrumRole, Meter, Pattern, Section, SectionFill, Song } from '../types.ts'

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

/** Такты секции: целое 1..MAX_SECTION_BARS. Поле ввода (songScreen.ts) и
 * чтение из БД — через это, иначе дробные такты рвут диапазоны секций в
 * движке, а «100000» строит сотни тысяч квадратиков. */
export const clampBars = (value: unknown): number => clampInt(value, 1, CONFIG.MAX_SECTION_BARS, 1)

export const clampBpm = (value: unknown): number => clampInt(value, CONFIG.MIN_BPM, CONFIG.MAX_BPM, CONFIG.DEFAULT_BPM)

export function clampMeter(meter: Partial<Meter>): Meter {
  return {
    beatsPerBar: clampInt(meter.beatsPerBar, CONFIG.MIN_BEATS_PER_BAR, CONFIG.MAX_BEATS_PER_BAR, DEFAULT_METER.beatsPerBar),
    beatDivision: clampInt(meter.beatDivision, CONFIG.MIN_BEAT_DIVISION, CONFIG.MAX_BEAT_DIVISION, DEFAULT_METER.beatDivision),
  }
}

export function newSectionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function createEmptySong(name: string): Song {
  return {
    id: Date.now(),
    name: name.trim().slice(0, CONFIG.MAX_NAME_LENGTH) || 'Без названия',
    bpm: CONFIG.DEFAULT_BPM,
    ...DEFAULT_METER,
    sections: [{ id: newSectionId(), name: '1 2 3 4', bars: 2, intro: true, comment: '' }],
    pattern: { steps: PATTERN_STEPS, tracks: [] },
  }
}

// Сырые данные из БД: любые поля могут отсутствовать или быть не того типа.
type Raw = Record<string, unknown>

function normalizeSection(raw: Raw, index: number, usedIds: Set<string>): Section {
  // Секции, сохранённые до появления id, получают его по позиции: так он
  // одинаков на всех устройствах до первой записи, а с ней — сохраняется.
  let id = typeof raw.id === 'string' && raw.id ? raw.id : `s${index}`
  while (usedIds.has(id)) id += '_'
  usedIds.add(id)
  const section: Section = {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'VERSE',
    bars: clampBars(raw.bars),
    comment: typeof raw.comment === 'string' ? raw.comment.slice(0, CONFIG.MAX_COMMENT_LENGTH) : '',
    intro: !!raw.intro,
  }
  if (typeof raw.beatId === 'string' && raw.beatId) section.beatId = raw.beatId
  const fills = (Array.isArray(raw.fills) ? (raw.fills as SectionFill[]) : [])
    .filter((f) => !!f && typeof f.beatId === 'string' && Number.isFinite(f.at) && f.at >= 0)
    .map((f) => ({ at: Math.floor(f.at), beatId: f.beatId }))
  if (fills.length) section.fills = fills
  return section
}

/** Песня из БД → актуальная модель: id секций, такты в пределах, размер
 * такта (у старых песен его нет — 4/4), темп в пределах. Поля движка
 * (groove/fillPatterns) отбрасываются — в БД им не место. */
export function normalizeSong(input: unknown): Song {
  const raw = (input ?? {}) as Raw
  const usedIds = new Set<string>()
  const pattern = raw.pattern as Pattern | undefined
  return {
    id: Number(raw.id),
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Без названия',
    bpm: clampBpm(raw.bpm),
    ...clampMeter(raw as Partial<Meter>),
    sections: (Array.isArray(raw.sections) ? raw.sections : []).map((sec, i) => normalizeSection((sec ?? {}) as Raw, i, usedIds)),
    pattern: pattern && Array.isArray(pattern.tracks) ? pattern : { steps: PATTERN_STEPS, tracks: [] },
  }
}

export function songMeter(song: Song): Meter {
  return { beatsPerBar: song.beatsPerBar, beatDivision: song.beatDivision }
}

/** Долей в секции при размере песни. */
export const sectionBeatCount = (section: Section, beatsPerBar: number): number => section.bars * beatsPerBar

/** Филлы, начинающиеся за концом своей секции (секцию укоротили, в такте
 * стало меньше долей), убираются — их квадратика больше нет, ни увидеть, ни
 * снять их было бы нельзя. */
export function pruneFills(sections: Section[], beatsPerBar: number): Section[] {
  return sections.map((sec) => {
    if (!sec.fills) return sec
    const fills = sec.fills.filter((f) => f.at < sectionBeatCount(sec, beatsPerBar))
    return fills.length === sec.fills.length ? sec : { ...sec, fills }
  })
}

/** Сколько долей песни занимает бит: размер N/M — N долей (data/beatMeter.ts). */
export const beatLengthInBeats = (beat: Beat | undefined): number => beat?.beatsPerBar ?? 1

/** То, что звучит на доле `at` секции, — как новый бит на одну долю (для
 * «Редактировать» в выборе филла, screens/songScreen.ts). Те же правила, что
 * у движка (soundSourceAt в engine/audioEngine.ts): грув секции по кругу от
 * начала секции → паттерн песни по кругу от начала песни → ничего (пустая
 * сетка 1/4: звучит пауза, пока не поставите ноты). Филл на доле копирует
 * сам экран — здесь только то, что под ним. */
export function sliceForBeat(song: Song, sectionIndex: number, at: number, id: string, beats: Beat[]): Beat {
  const sec = song.sections[sectionIndex]
  const name = `${sec.name} · доля ${at + 1}`
  const groove = sec.beatId ? beats.find((b) => b.id === sec.beatId) : undefined
  if (groove) {
    const m = groove.beatDivision
    const offset = (at * m) % groove.steps
    return {
      id, kind: 'break', name, steps: m, beatsPerBar: 1, beatDivision: m, kitId: groove.kitId,
      tracks: groove.tracks.map((t) => ({ role: t.role, steps: Array.from({ length: m }, (_, i) => !!t.steps[offset + i]) })),
    }
  }
  // Паттерн песни: дорожки — сэмплы редактора паттерна (bd/sd/hh), идут по
  // кругу от начала песни, stepsPerBeat шагов на долю (как в движке).
  const pattern = song.pattern
  const roleById: Record<string, DrumRole> = { bd: 'kick', sd: 'snare', hh: 'hihat' }
  if (pattern?.tracks.some((t) => t.steps.some(Boolean))) {
    const m = pattern.stepsPerBeat ?? 2
    const songBeat = song.sections.slice(0, sectionIndex).reduce((n, s) => n + s.bars, 0) * song.beatsPerBar + at
    const offset = (songBeat * m) % pattern.steps
    const tracks = pattern.tracks
      .filter((t) => roleById[t.id])
      .map((t) => ({ role: roleById[t.id], steps: Array.from({ length: m }, (_, i) => !!t.steps[(offset + i) % pattern.steps]) }))
    return { id, kind: 'break', name, steps: m, beatsPerBar: 1, beatDivision: m, kitId: DEFAULT_KIT_ID, tracks }
  }
  const roles: DrumRole[] = ['hihat', 'snare', 'kick']
  return { id, kind: 'break', name, steps: 4, beatsPerBar: 1, beatDivision: 4, kitId: DEFAULT_KIT_ID, tracks: roles.map((role) => ({ role, steps: [false, false, false, false] })) }
}
