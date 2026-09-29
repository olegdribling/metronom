// Beat хранит РОЛЬ барабана на дорожке, а не сэмпл — резолвим в обычный
// Pattern/PatternTrack прямо перед проигрыванием (engine.setSong()), чтобы
// audioEngine.ts вообще не знал про Beat/DrumKit и остался без изменений.
import { DRUM_KITS, DEFAULT_KIT_ID, DRUM_ROLE_COLORS, PATTERN_STEPS } from '../config.ts'
import { Beat, Pattern } from '../types.ts'

export function resolveBeatPattern(beat: Beat, kitId: string = DEFAULT_KIT_ID): Pattern {
  const kit = DRUM_KITS.find((k) => k.id === kitId) ?? DRUM_KITS[0]
  return {
    steps: beat.bars * PATTERN_STEPS,
    tracks: beat.tracks.map((track) => ({
      id: `${kit.id}_${track.role}`,
      name: kit.sounds[track.role].label,
      color: DRUM_ROLE_COLORS[track.role],
      sample: kit.sounds[track.role].sample,
      steps: track.steps,
    })),
  }
}
