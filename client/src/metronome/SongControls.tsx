import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import { Icon } from './Icon'

interface SongControlsProps {
  bpm: number
  changeBpm: (delta: number) => void
  updateSongBpm: (value: number) => void
  isPlaying: boolean
  start: () => void
  stop: () => void
  samplesLoaded: boolean
  onOpenPatternEditor: () => void
}

export function SongControls({
  bpm, changeBpm, updateSongBpm,
  isPlaying, start, stop,
  samplesLoaded, onOpenPatternEditor,
}: SongControlsProps) {
  const theme = useTheme()
  const [panel, setPanel] = useState<null | 'bpm' | 'sound'>(null)

  const togglePanel = (name: 'bpm' | 'sound') =>
    setPanel(p => p === name ? null : name)

  return (
    <div
      className="fixed left-0 right-0 z-50"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)' }}
    >
      {/* BPM sheet */}
      {panel === 'bpm' && (
        <div className={`mx-4 mb-3 p-4 rounded-2xl shadow-xl ${theme.card}`}>
          <div className="text-center mb-3">
            <span className="text-4xl font-black">{bpm}</span>
            <span className={`ml-2 ${theme.textSub}`}>BPM</span>
          </div>
          <input
            type="range" min={40} max={240} value={bpm}
            onChange={(e) => updateSongBpm(+e.target.value)}
            className={`w-full mb-3 ${theme.sliderAccent}`}
          />
          <div className="grid grid-cols-4 gap-2">
            {([-10, -1, 1, 10] as const).map(d => (
              <button key={d} onClick={() => changeBpm(d)}
                className={`py-2 rounded-xl text-sm ${theme.btn}`}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sound sheet */}
      {panel === 'sound' && (
        <div className={`mx-4 mb-3 p-4 rounded-2xl shadow-xl ${theme.card}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${theme.textSub}`}>Звук</p>
          <div className="space-y-2">
            <div className={`flex items-center gap-3 p-3 rounded-xl ${theme.btn} opacity-60`}>
              <Icon name="metronome" className="text-lg" />
              <span className="flex-1 text-sm font-medium">Клик</span>
              <span className={`text-xs ${theme.textSub}`}>активен</span>
            </div>
            <button
              onClick={() => { onOpenPatternEditor(); setPanel(null) }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${theme.btn}`}
            >
              <Icon name="music-note" className="text-lg" />
              <span className="flex-1 text-sm font-medium text-left">
                {samplesLoaded ? 'Свой паттерн' : 'Загрузка...'}
              </span>
              {!samplesLoaded && <Icon name="spinner" className="animate-spin" />}
            </button>
            <div className={`flex items-center gap-3 p-3 rounded-xl ${theme.btn} opacity-40`}>
              <Icon name="microphone" className="text-lg" />
              <span className="flex-1 text-sm font-medium">Голос (счёт)</span>
              <span className={`text-xs ${theme.textSub}`}>скоро</span>
            </div>
          </div>
        </div>
      )}

      {/* 3-button bar */}
      <div className="flex items-center justify-center gap-8 px-6 py-4">
        <button
          onClick={() => togglePanel('bpm')}
          className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition active:scale-95 ${
            panel === 'bpm' ? theme.btnAccent + ' text-white' : theme.btn
          }`}
        >
          <span className="text-base font-black leading-none">{bpm}</span>
          <span className={`text-[9px] leading-none mt-0.5 ${panel === 'bpm' ? 'text-white/70' : theme.textSub}`}>BPM</span>
        </button>

        <button
          onClick={isPlaying ? stop : start}
          className={`w-20 h-20 rounded-full text-3xl flex items-center justify-center transition active:scale-95 shadow-lg ${
            isPlaying ? theme.stopBtn : theme.playBtn
          }`}
        >
          <Icon name={isPlaying ? 'stop' : 'play'} />
        </button>

        <button
          onClick={() => togglePanel('sound')}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition active:scale-95 text-xl ${
            panel === 'sound' ? theme.btnAccent + ' text-white' : theme.btn
          }`}
        >
          <Icon name="speaker-high" />
        </button>
      </div>
    </div>
  )
}
