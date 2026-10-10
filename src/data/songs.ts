// Песня как данные: приведение к актуальной модели при чтении из БД и чистые
// расчёты по песне, общие для экранов (screens/songScreen.ts,
// metronomeScreen.ts) и состояния (state/appState.ts).
import { CONFIG, DEFAULT_METER } from '../config.ts'
import { Beat, Meter, Section, SectionFill, Song } from '../types.ts'
import { clampBpm, clampInt, clampMeter } from './limits.ts'
import { createEmptyBeat, normalizeBeat } from './beatsLibrary.ts'

export { clampBpm, clampMeter }

/** Такты секции: целое 1..MAX_SECTION_BARS. Поле ввода (songScreen.ts) и
 * чтение из БД — через это, иначе дробные такты рвут диапазоны секций в
 * движке, а «100000» строит сотни тысяч квадратиков. */
export const clampBars = (value: unknown): number => clampInt(value, 1, CONFIG.MAX_SECTION_BARS, 1)

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
    pattern: emptySongPattern(),
  }
}

/** Паттерн песни — бит внутри песни (Song.pattern). Пустой — щелчок. */
export const SONG_PATTERN_ID = 'pattern'
export const emptySongPattern = (): Beat => createEmptyBeat(SONG_PATTERN_ID, 'Паттерн')

// Паттерн из БД. Раньше он был в своём формате (16 клеток восьмыми, дорожки
// bd/sd/hh, без kitId) — такие выкидываются, песня начинает с пустого
// (решение пользователя: старые паттерны не переносим).
function normalizeSongPattern(raw: unknown): Beat {
  const p = raw as Partial<Beat> | undefined
  if (!p || typeof p !== 'object' || typeof p.kitId !== 'string') return emptySongPattern()
  return normalizeBeat({ ...p, id: SONG_PATTERN_ID, name: 'Паттерн' })
}

// Сырые данные из БД: любые поля могут отсутствовать или быть не того типа.
type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value)

/** Бит внутри песни (бит секции, филл) из БД. */
function normalizeSongBeat(raw: Raw): Beat {
  return normalizeBeat({ ...(raw as Partial<Beat>), id: typeof raw.id === 'string' && raw.id ? raw.id : 'beat' })
}

/** id нового бита внутри песни (копия из «Битов», кусок квадратика). */
export const newBeatId = (): string => `beat_${newSectionId()}`

/** Копия бита — в песню (решение пользователя: песня не зависит от
 * «Битов», правки из песни туда не уходят). */
export function copyBeat(beat: Beat, id: string = newBeatId()): Beat {
  return { ...beat, id, tracks: beat.tracks.map((t) => ({ ...t, steps: [...t.steps] })) }
}

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
  // Бит секции и филлы — копии внутри песни; старые песни хранили ссылки на
  // «Биты» (beatId) — их переносит копиями embedLibraryBeats.
  if (isRaw(raw.beat)) section.beat = normalizeSongBeat(raw.beat)
  else if (typeof raw.beatId === 'string' && raw.beatId) section.beatId = raw.beatId
  const fills = (Array.isArray(raw.fills) ? (raw.fills as unknown[]) : []).flatMap((f): SectionFill[] => {
    if (!isRaw(f) || !Number.isFinite(f.at) || (f.at as number) < 0) return []
    const at = Math.floor(f.at as number)
    if (isRaw(f.beat)) return [{ at, beat: normalizeSongBeat(f.beat) }]
    return typeof f.beatId === 'string' && f.beatId ? [{ at, beatId: f.beatId }] : []
  })
  if (fills.length) section.fills = fills
  return section
}

/** Старые песни ссылались на биты из «Битов» (бит секции, филлы) — копии
 * этих битов встают внутрь песни (решение пользователя: песня не зависит от
 * «Битов»). Ссылка на удалённый бит убирается — она и так не звучала. Ссылок
 * нет — та же песня (тот же объект). */
export function embedLibraryBeats(song: Song, beats: Beat[]): Song {
  const linked = (sec: Section) => !!sec.beatId || !!sec.fills?.some((f) => f.beatId !== undefined)
  if (!song.sections.some(linked)) return song
  const byId = new Map(beats.map((b) => [b.id, b]))
  return {
    ...song,
    sections: song.sections.map((sec) => {
      if (!linked(sec)) return sec
      const { beatId, fills, ...rest } = sec
      const next: Section = { ...rest }
      const groove = beatId ? byId.get(beatId) : undefined
      if (!next.beat && groove) next.beat = copyBeat(groove, groove.id)
      const embedded = (fills ?? []).flatMap((f): SectionFill[] => {
        if (f.beat) return [{ at: f.at, beat: f.beat }]
        const beat = f.beatId ? byId.get(f.beatId) : undefined
        return beat ? [{ at: f.at, beat: copyBeat(beat, beat.id) }] : []
      })
      if (embedded.length) next.fills = embedded
      return next
    }),
  }
}

/** Песня из БД → актуальная модель: id секций, такты в пределах, размер
 * такта (у старых песен его нет — 4/4), темп в пределах. Поля движка
 * (groove/fillPatterns) отбрасываются — в БД им не место. */
export function normalizeSong(input: unknown): Song {
  const raw = (input ?? {}) as Raw
  const usedIds = new Set<string>()
  return {
    id: Number(raw.id),
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Без названия',
    bpm: clampBpm(raw.bpm),
    ...clampMeter(raw as Partial<Meter>),
    sections: (Array.isArray(raw.sections) ? raw.sections : []).map((sec, i) => normalizeSection((sec ?? {}) as Raw, i, usedIds)),
    pattern: normalizeSongPattern(raw.pattern),
  }
}

export function songMeter(song: Song): Meter {
  return { beatsPerBar: song.beatsPerBar, beatDivision: song.beatDivision }
}

/** Долей в секции при размере песни. */
export const sectionBeatCount = (section: Section, beatsPerBar: number): number => section.bars * beatsPerBar

/** Сколько квадратиков-долей секции в строке сетки — целыми тактами, как в v1
 * (там 2 такта по 4 доли = 8 квадратиков): строка не больше 8, но не меньше
 * одного такта (при 9+ долях в такте — такт на строку). Экран песни и
 * «Концерт» — одинаково. */
export const barGridColumns = (beatsPerBar: number): number => beatsPerBar * Math.max(1, Math.floor(8 / beatsPerBar))

/** «Концерт» (решение пользователя): Play — отсчёт и сразу первая настоящая
 * секция, вступление «1 2 3 4» пропускается. В песне только вступление — с
 * начала (оно играет по кругу, как на экране песни). */
export function concertStart(song: Song): { sectionIndex: number; fromBar: number } {
  const sectionIndex = song.sections.findIndex((s) => !s.intro)
  if (sectionIndex < 0) return { sectionIndex: 0, fromBar: 0 }
  return { sectionIndex, fromBar: song.sections.slice(0, sectionIndex).reduce((bars, s) => bars + s.bars, 0) }
}

/** Где песня на такте `bar` (такт от начала песни, как у движка): секция и
 * такт внутри неё (с 1). За концом песни — null. */
export function sectionAtBar(song: Song, bar: number): { sectionIndex: number; barInSection: number } | null {
  let start = 0
  for (let i = 0; i < song.sections.length; i++) {
    const end = start + song.sections[i].bars
    if (bar >= start && bar < end) return { sectionIndex: i, barInSection: bar - start + 1 }
    start = end
  }
  return null
}

/** Доли секции под филлами (номер доли от начала секции, с 0) — как их
 * играет движок: конец секции обрезает, старая ссылка без копии не звучит. */
export function fillBeats(section: Section, beatsPerBar: number): Set<number> {
  const total = sectionBeatCount(section, beatsPerBar)
  const covered = new Set<number>()
  for (const f of section.fills ?? []) {
    if (!f.beat) continue
    for (let i = f.at; i < Math.min(f.at + beatLengthInBeats(f.beat), total); i++) covered.add(i)
  }
  return covered
}

/** Песня с новым размером такта (строка темпа на экране песни). Филлы за
 * новым концом секций убираются (pruneFills). */
export function withSongMeter(song: Song, meter: Meter): Song {
  const next = clampMeter(meter)
  return { ...song, ...next, sections: pruneFills(song.sections, next.beatsPerBar) }
}

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

/** Филл, который звучит на доле `at` секции: поздний перекрывает ранний —
 * как в движке (soundSourceAt в engine/audioEngine.ts). */
export function coveringFill(section: Section, at: number): { at: number; beat: Beat } | undefined {
  let found: { at: number; beat: Beat } | undefined
  for (const f of section.fills ?? []) {
    if (f.beat && at >= f.at && at < f.at + beatLengthInBeats(f.beat) && (!found || f.at > found.at)) found = { at: f.at, beat: f.beat }
  }
  return found
}

/** То, что звучит на доле `at` секции, — как новый бит на одну долю (для
 * «Редактировать» в выборе филла, screens/songScreen.ts). Те же правила, что
 * у движка (soundSourceAt в engine/audioEngine.ts): грув секции по кругу от
 * начала секции → паттерн песни по кругу от начала песни → ничего (пустая
 * сетка 1/4: звучит пауза, пока не поставите ноты). Филл на доле копирует
 * сам экран — здесь только то, что под ним. Темп бита — темп песни: в
 * редакторе он звучит так же, как в ней. */
export function sliceForBeat(song: Song, sectionIndex: number, at: number, id: string): Beat {
  const sec = song.sections[sectionIndex]
  const name = `${sec.name} · доля ${at + 1}`
  const bpm = song.bpm
  const groove = sec.beat
  if (groove) {
    const m = groove.beatDivision
    const offset = (at * m) % groove.steps
    return {
      id, kind: 'break', name, steps: m, beatsPerBar: 1, beatDivision: m, kitId: groove.kitId, bpm,
      tracks: groove.tracks.map((t) => ({ role: t.role, steps: Array.from({ length: m }, (_, i) => !!t.steps[offset + i]) })),
    }
  }
  // Паттерн песни: идёт по кругу от начала песни, M шагов на долю (как в
  // движке).
  const pattern = song.pattern
  if (pattern.tracks.some((t) => t.steps.some(Boolean))) {
    const m = pattern.beatDivision
    const songBeat = song.sections.slice(0, sectionIndex).reduce((n, s) => n + s.bars, 0) * song.beatsPerBar + at
    const offset = (songBeat * m) % pattern.steps
    return {
      id, kind: 'break', name, steps: m, beatsPerBar: 1, beatDivision: m, kitId: pattern.kitId, bpm,
      tracks: pattern.tracks.map((t) => ({ role: t.role, steps: Array.from({ length: m }, (_, i) => !!t.steps[(offset + i) % pattern.steps]) })),
    }
  }
  return { ...createEmptyBeat(id, name, 'break'), bpm }
}

/** Что в квадратике (доле `at` секции) — для «Копировать влево/вправо»
 * (screens/songScreen.ts): квадратик копируется в соседний целиком, новым
 * битом внутри песни (id — ему):
 * - филл ровно на эту долю — его копия;
 * - кусок длинного филла, грува секции или паттерна песни — бит на одну
 *   долю, темп — песни;
 * - только щелчок (ни филла, ни грува, ни нот в паттерне) — null.
 * Правила — как у движка (soundSourceAt в engine/audioEngine.ts). */
export function squareContent(song: Song, sectionIndex: number, at: number, id: string): Beat | null {
  const sec = song.sections[sectionIndex]
  const covering = coveringFill(sec, at)
  if (covering) {
    const fill = covering.beat
    if (covering.at === at && fill.beatsPerBar === 1) return copyBeat(fill, id)
    const m = fill.beatDivision
    const offset = (at - covering.at) * m
    return {
      id, kind: 'break', name: `${fill.name} · доля ${at - covering.at + 1}`, steps: m, beatsPerBar: 1, beatDivision: m,
      kitId: fill.kitId, bpm: song.bpm,
      tracks: fill.tracks.map((t) => ({ role: t.role, steps: Array.from({ length: m }, (_, i) => !!t.steps[offset + i]) })),
    }
  }
  const patternHasNotes = song.pattern.tracks.some((t) => t.steps.some(Boolean))
  if (!sec.beat && !patternHasNotes) return null
  return sliceForBeat(song, sectionIndex, at, id)
}
