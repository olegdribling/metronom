// Beat хранит РОЛЬ барабана на дорожке, а не сэмпл — резолвим в обычный
// Pattern/PatternTrack прямо перед проигрыванием (engine.setSong()), чтобы
// audioEngine.ts вообще не знал про Beat/DrumKit и остался без изменений.
import { DRUM_KITS, DEFAULT_KIT_ID, DRUM_ROLE_COLORS } from '../config.ts'
import { Beat, Pattern } from '../types.ts'

export function resolveBeatPattern(beat: Beat, kitId: string = beat.kitId ?? DEFAULT_KIT_ID): Pattern {
  const kit = DRUM_KITS.find((k) => k.id === kitId) ?? DRUM_KITS[0]
  return {
    // ВАЖНО: bars × beatsPerBar × beatDivision, не PATTERN_STEPS — это
    // фактическая длина track.steps[] (beatEditorScreen.ts: totalStepsOf()).
    // Раньше здесь было bars * PATTERN_STEPS (16 на такт) — расходилось с
    // реальной длиной дорожек при любом размере такта, кроме 4/4.
    steps: beat.bars * beat.beatsPerBar * beat.beatDivision,
    tracks: beat.tracks.map((track) => ({
      id: `${kit.id}_${track.role}`,
      name: kit.sounds[track.role].label,
      color: DRUM_ROLE_COLORS[track.role],
      sample: kit.sounds[track.role].sample,
      steps: track.steps,
    })),
  }
}
