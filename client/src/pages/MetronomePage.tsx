import { MetronomeTab } from '../metronome/MetronomeTab'
import { PlaybackState } from '../types'

interface MetronomePageProps {
  bpm: number
  changeBpm: (delta: number) => void
  updateSongBpm: (value: number) => void
  playbackState: PlaybackState
  isPlaying: boolean
  beatsPerBar: number
  setBeatsPerBar: (n: number) => void
}

// Русский комментарий: отдельная страница метронома, чтобы не смешивать ее с другими экранами.
export function MetronomePage(props: MetronomePageProps) {
  return <MetronomeTab {...props} />
}
