import { useTheme } from '../ThemeContext'
import { Icon } from './Icon'

interface PlaybackBarProps {
  isPlaying: boolean
  start: () => void
  stop: () => void
  nextSectionName?: string | null
}

export function PlaybackBar({ isPlaying, start, stop, nextSectionName }: PlaybackBarProps) {
  const theme = useTheme()
  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 24px)' }}
    >
      {isPlaying && nextSectionName && (
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${theme.card} ${theme.textSub}`}>
          next: {nextSectionName}
        </div>
      )}
      <button
        onClick={isPlaying ? stop : start}
        className={`w-20 h-20 rounded-full text-3xl transition active:scale-95 flex items-center justify-center ${
          isPlaying ? theme.stopBtn : theme.playBtn
        }`}
      >
        <Icon name={isPlaying ? 'stop' : 'play'} />
      </button>
    </div>
  )
}
