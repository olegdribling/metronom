// Что и как играет движок для источника звука страницы (app.ts): у
// метронома, песни и бита всё своё, друг на друга они не влияют (решение
// пользователя). Чистые функции — проверяются в tests/data.test.ts.
import { Beat, MetronomeSettings, PlaybackSource, Song } from '../types.ts'
import { resolveBeatPattern, resolveSongForEngine } from './resolveBeat.ts'

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
  songs: Song[]
  beats: Beat[]
  voiceCues: boolean
}

export const sameSource = (a: PlaybackSource, b: PlaybackSource): boolean =>
  a.kind === b.kind &&
  (a.kind !== 'song' || a.songId === (b as typeof a).songId) &&
  (a.kind !== 'beat' || a.beatId === (b as typeof a).beatId)

/** null — играть нечего: песня или бит ещё не пришли из БД или удалены. */
export function engineSettingsFor(source: PlaybackSource, inputs: EngineInputs): EngineSettings | null {
  if (source.kind === 'metronome') {
    const m = inputs.metronome
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
  const beat = inputs.beats.find((b) => b.id === source.beatId)
  if (!beat) return null
  // Размер бита — для щелчка, пока в бите нет нот: щелчок на каждую клетку.
  return { bpm: beat.bpm, beatsPerBar: beat.beatsPerBar, beatDivision: beat.beatDivision, voiceCount: false, voiceCues: false, content: { beat } }
}

/** Песня для движка: копия с подставленными паттернами битов секций, или
 * бит как песня без секций — тогда он играет ровно beat.steps шагов по кругу
 * (с секцией движок обрывал бы круг на конце «песни» в своих тактах). */
export function songForEngine(content: EngineSettings['content']): Song | null {
  if (!content) return null
  if ('song' in content) return resolveSongForEngine(content.song, content.beats)
  const { beat } = content
  return {
    id: -1,
    name: beat.name,
    bpm: beat.bpm,
    beatsPerBar: beat.beatsPerBar,
    beatDivision: beat.beatDivision,
    sections: [],
    pattern: resolveBeatPattern(beat),
  }
}
