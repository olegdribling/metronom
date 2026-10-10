// Beat хранит РОЛЬ барабана на дорожке, а не сэмпл — резолвим в обычный
// Pattern/PatternTrack прямо перед проигрыванием (engine.setSong()), чтобы
// audioEngine.ts вообще не знал про Beat/DrumKit и остался без изменений.
import { DRUM_KITS, DEFAULT_KIT_ID, DRUM_ROLE_COLORS } from '../config.ts'
import { Beat, EngineSong, Pattern, Song } from '../types.ts'

export function resolveBeatPattern(beat: Beat, kitId: string = beat.kitId ?? DEFAULT_KIT_ID): Pattern {
  const kit = DRUM_KITS.find((k) => k.id === kitId) ?? DRUM_KITS[0]
  return {
    // ВАЖНО: beat.steps (фактическая длина track.steps[]), не «такты × 16» —
    // так было раньше и расходилось с реальной длиной дорожек при любом
    // размере, кроме 4/4. Длина свободная (см. Beat.steps в types.ts).
    steps: beat.steps,
    // Шаг бита = 1/M доли (размер N/M, data/beatMeter.ts).
    stepsPerBeat: beat.beatDivision,
    tracks: beat.tracks.map((track) => ({
      id: `${kit.id}_${track.role}`,
      name: kit.sounds[track.role].label,
      color: DRUM_ROLE_COLORS[track.role],
      sample: kit.sounds[track.role].sample,
      steps: track.steps,
    })),
  }
}

// Песня для движка: паттерн песни и биты секций (грув, филлы) — копии
// внутри песни — разрешены в сэмплы; движок про Beat не знает. Старая
// ссылка на «Биты» без копии (ещё не перенесена, embedLibraryBeats) — как
// будто не назначена: секция играет паттерн песни, филл пропускается.
export function resolveSongForEngine(song: Song): EngineSong {
  return {
    pattern: resolveBeatPattern(song.pattern),
    sections: song.sections.map((sec) => ({
      ...sec,
      groove: sec.beat ? resolveBeatPattern(sec.beat) : undefined,
      fillPatterns: (sec.fills ?? []).flatMap((f) => (f.beat ? [{ at: f.at, pattern: resolveBeatPattern(f.beat) }] : [])),
    })),
  }
}
