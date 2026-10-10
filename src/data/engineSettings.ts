// Что и как играет движок для источника звука страницы (app.ts): у
// метронома, песни и бита всё своё, друг на друга они не влияют (решение
// пользователя). Чистые функции — проверяются в tests/data.test.ts.
import { Beat, EngineSong, MetronomeSettings, Pattern, PlaybackSource, Song } from '../types.ts'
import { resolveBeatPattern, resolveSongForEngine } from './resolveBeat.ts'
import { emptyMetronomePattern } from './beatsLibrary.ts'

export interface EngineSettings {
  /** Темп движка — доли (крупной точки) в минуту. */
  bpm: number
  beatsPerBar: number
  beatDivision: number
  voiceCount: boolean
  voiceCues: boolean
  /** Что играть: песня (её биты секций и филлы — внутри неё) или бит
   * (speed — множитель скорости своего паттерна метронома); null — щелчок. */
  content: { song: Song } | { beat: Beat; speed?: number } | null
}

export interface EngineInputs {
  metronome: MetronomeSettings
  metronomePattern: Beat | null
  songs: Song[]
  beats: Beat[]
  voiceCues: boolean
}

export const sameSource = (a: PlaybackSource, b: PlaybackSource): boolean => JSON.stringify(a) === JSON.stringify(b)

/** null — играть нечего: песня или бит ещё не пришли из БД или удалены. */
export function engineSettingsFor(source: PlaybackSource, inputs: EngineInputs): EngineSettings | null {
  if (source.kind === 'metronome' || source.kind === 'metronomePattern') {
    const m = inputs.metronome
    // «Свой паттерн» (решение пользователя): метроном остаётся собой —
    // скорость, размер, кольцо его; вместо щелчка по кругу играет паттерн.
    // Доля паттерна = доля метронома: паттерн N/M занимает N долей, его M
    // клеток делят долю (2/3 на 4/4 — триоли на две доли). В редакторе
    // паттерна играет он всегда (ещё не набит — пустой; размер — его, для
    // щелчка, пока нот нет), на странице метронома — если включён и есть.
    const pattern =
      source.kind === 'metronomePattern' ? (inputs.metronomePattern ?? emptyMetronomePattern()) : m.usePattern ? inputs.metronomePattern : null
    if (pattern) {
      const meter = source.kind === 'metronomePattern' ? pattern : m
      return {
        bpm: m.bpm / m.beatDivision,
        beatsPerBar: meter.beatsPerBar,
        beatDivision: meter.beatDivision,
        voiceCount: m.voiceCount,
        voiceCues: false,
        content: { beat: pattern, speed: m.patternSpeed },
      }
    }
    return {
      // У метронома BPM — скорость каждой точки кольца: доля из
      // beatDivision точек длится beatDivision ударов (решение пользователя).
      bpm: m.bpm / m.beatDivision,
      beatsPerBar: m.beatsPerBar,
      beatDivision: m.beatDivision,
      voiceCount: m.voiceCount,
      voiceCues: false,
      content: null,
    }
  }
  if (source.kind === 'song' || source.kind === 'concert') {
    const song = inputs.songs.find((s) => s.id === source.songId)
    if (!song) return null
    return {
      bpm: song.bpm,
      beatsPerBar: song.beatsPerBar,
      beatDivision: song.beatDivision,
      voiceCount: false,
      // На сцене голос смены секции нужен всегда (решение пользователя), в
      // песне — по настройке.
      voiceCues: source.kind === 'concert' || inputs.voiceCues,
      content: { song },
    }
  }
  if (source.kind === 'songPattern') {
    // Паттерн песни в его редакторе — только он, по кругу, в темпе песни.
    const song = inputs.songs.find((s) => s.id === source.songId)
    return song ? beatSettings(song.pattern, song.bpm) : null
  }
  if (source.kind === 'songFill') {
    // Филл секции в своём редакторе — так же: только он, в темпе песни.
    const song = inputs.songs.find((s) => s.id === source.songId)
    const fill = song?.sections.find((s) => s.id === source.sectionId)?.fills?.find((f) => f.at === source.at)
    return song && fill?.beat ? beatSettings(fill.beat, song.bpm) : null
  }
  const beat = inputs.beats.find((b) => b.id === source.beatId)
  return beat ? beatSettings(beat, beat.bpm) : null
}

// Бит в редакторе. Размер бита — для щелчка, пока в бите нет нот: щелчок на
// каждую клетку.
function beatSettings(beat: Beat, bpm: number): EngineSettings {
  return { bpm, beatsPerBar: beat.beatsPerBar, beatDivision: beat.beatDivision, voiceCount: false, voiceCues: false, content: { beat } }
}

/** Песня для движка: копия с подставленными паттернами битов секций, или
 * бит как песня без секций — тогда он играет ровно beat.steps шагов по кругу
 * (с секцией движок обрывал бы круг на конце «песни» в своих тактах). */
export function songForEngine(content: EngineSettings['content']): EngineSong | null {
  if (!content) return null
  if ('song' in content) return resolveSongForEngine(content.song)
  return { sections: [], pattern: withSpeed(resolveBeatPattern(content.beat), content.speed ?? 1) }
}

// Множитель скорости своего паттерна метронома (×½, ×1, ×2): ×2 — вдвое
// больше шагов на долю; ×½ — каждая клетка растянута на два шага (между
// клетками пустой шаг), шагов на долю столько же. Движку нужны целые шаги
// на долю — поэтому ×½ не делением M (у 3 вышло бы 1,5).
function withSpeed(pattern: Pattern, speed: number): Pattern {
  if (speed === 2) return { ...pattern, stepsPerBeat: pattern.stepsPerBeat * 2 }
  if (speed === 0.5) {
    return {
      ...pattern,
      steps: pattern.steps * 2,
      tracks: pattern.tracks.map((t) => ({ ...t, steps: t.steps.flatMap((on) => [on, false]) })),
    }
  }
  return pattern
}
