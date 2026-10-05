// Что и как играет движок для источника звука страницы (app.ts): у
// метронома, песни и бита всё своё, друг на друга они не влияют (решение
// пользователя). Чистые функции — проверяются в tests/data.test.ts.
import { Beat, EngineSong, MetronomeSettings, PlaybackSource, Song } from '../types.ts'
import { resolveBeatPattern, resolveSongForEngine } from './resolveBeat.ts'
import { emptyMetronomePattern } from './beatsLibrary.ts'

export interface EngineSettings {
  /** Темп движка — доли (крупной точки) в минуту. */
  bpm: number
  beatsPerBar: number
  beatDivision: number
  voiceCount: boolean
  voiceCues: boolean
  /** Что играть: песня (с битами — подставить паттерны секций) или бит;
   * null — щелчок метронома. */
  content: { song: Song; beats: Beat[] } | { beat: Beat } | null
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
        content: { beat: pattern },
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
  if (source.kind === 'song') {
    const song = inputs.songs.find((s) => s.id === source.songId)
    if (!song) return null
    return {
      bpm: song.bpm,
      beatsPerBar: song.beatsPerBar,
      beatDivision: song.beatDivision,
      voiceCount: false,
      voiceCues: inputs.voiceCues,
      content: { song, beats: inputs.beats },
    }
  }
  if (source.kind === 'songPattern') {
    // Паттерн песни в его редакторе — только он, по кругу, в темпе песни.
    const song = inputs.songs.find((s) => s.id === source.songId)
    return song ? beatSettings(song.pattern, song.bpm) : null
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
  if ('song' in content) return resolveSongForEngine(content.song, content.beats)
  return { sections: [], pattern: resolveBeatPattern(content.beat) }
}
