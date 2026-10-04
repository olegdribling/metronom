// Beat хранит РОЛЬ барабана на дорожке, а не сэмпл — резолвим в обычный
// Pattern/PatternTrack прямо перед проигрыванием (engine.setSong()), чтобы
// audioEngine.ts вообще не знал про Beat/DrumKit и остался без изменений.
import { DRUM_KITS, DEFAULT_KIT_ID, DRUM_ROLE_COLORS } from '../config.ts'
import { Beat, Pattern, Song } from '../types.ts'

export function resolveBeatPattern(beat: Beat, kitId: string = beat.kitId ?? DEFAULT_KIT_ID): Pattern {
  const kit = DRUM_KITS.find((k) => k.id === kitId) ?? DRUM_KITS[0]
  return {
    // ВАЖНО: beat.steps (фактическая длина track.steps[]), не PATTERN_STEPS
    // и не «такты × 16» — раньше здесь было bars * PATTERN_STEPS и
    // расходилось с реальной длиной дорожек при любом размере такта, кроме
    // 4/4. Длина свободная, не кратна такту (см. Beat.steps в types.ts).
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

// Копия песни для движка: в секции подставлены разрешённые паттерны битов
// (грув секции, филлы). В песне хранятся только ссылки (beatId), движок
// про Beat не знает. Удалённый бит — как будто не назначен: секция играет
// паттерн песни, филл пропускается.
export function resolveSongForEngine(song: Song, beats: Beat[]): Song {
  const byId = new Map(beats.map((b) => [b.id, b]))
  return {
    ...song,
    sections: song.sections.map((sec) => {
      const grooveBeat = sec.beatId ? byId.get(sec.beatId) : undefined
      return {
        ...sec,
        groove: grooveBeat ? resolveBeatPattern(grooveBeat) : undefined,
        fillPatterns: (sec.fills ?? []).flatMap((f) => {
          const beat = byId.get(f.beatId)
          return beat ? [{ at: f.at, pattern: resolveBeatPattern(beat) }] : []
        }),
      }
    }),
  }
}
