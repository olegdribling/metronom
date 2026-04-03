import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import { PlaybackState } from '../types'

interface MetronomeTabProps {
  bpm: number
  changeBpm: (delta: number) => void
  updateSongBpm: (value: number) => void
  playbackState: PlaybackState
  isPlaying: boolean
  beatsPerBar: number
  setBeatsPerBar: (n: number) => void
}

export function MetronomeTab({
  bpm, changeBpm, updateSongBpm,
  playbackState, isPlaying,
  beatsPerBar, setBeatsPerBar,
}: MetronomeTabProps) {
  const theme = useTheme()
  const [showPicker, setShowPicker] = useState(false)

  const activeBeat = (playbackState.beat - 1) % beatsPerBar + 1
  const circleSize = beatsPerBar <= 6 ? 'w-12 h-12 text-base' : beatsPerBar <= 10 ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-xs'

  return (
    <div className="w-full max-w-xl">
      <div className={`p-6 mb-4 ${theme.card}`}>

        {/* Beat indicator */}
        <div className="flex justify-center flex-wrap gap-2 mb-6">
          {Array.from({ length: beatsPerBar }, (_, i) => i + 1).map(beat => (
            <div
              key={beat}
              className={`rounded-full transition-all duration-75 flex items-center justify-center font-bold ${circleSize} ${
                isPlaying && activeBeat === beat
                  ? beat === 1 ? theme.beatAccent : theme.beatActive
                  : theme.beat
              }`}
            >
              {beat}
            </div>
          ))}
        </div>

        {/* Beats per bar */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className={`text-sm ${theme.textSub}`}>долей в такте</span>
          <div className="relative">
            <button
              onClick={() => setShowPicker(v => !v)}
              className={`w-10 h-10 rounded-xl font-bold text-lg transition ${theme.btn} text-white`}
            >
              {beatsPerBar}
            </button>
            {showPicker && (
              <div className={`absolute right-0 top-12 z-10 rounded-2xl p-3 grid grid-cols-4 gap-2 shadow-xl w-48 ${theme.card}`}>
                {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => { setBeatsPerBar(n); setShowPicker(false) }}
                    className={`h-9 rounded-xl font-bold text-sm transition ${
                      n === beatsPerBar ? theme.btnAccent + ' text-white' : theme.btn + ' text-slate-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BPM display */}
        <div className="text-center mb-4">
          <span className="text-5xl font-black text-white">{bpm}</span>
          <span className={`ml-2 text-lg ${theme.textSub}`}>BPM</span>
        </div>

        {/* Slider */}
        <input
          type="range"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => updateSongBpm(+e.target.value)}
          className={`w-full mb-4 ${theme.sliderAccent}`}
        />

        {/* Step buttons */}
        <div className="grid grid-cols-4 gap-2">
          {([-10, -1, 1, 10] as const).map(delta => (
            <button
              key={delta}
              onClick={() => changeBpm(delta)}
              className={`py-2 rounded-2xl text-sm text-slate-300 ${theme.btn}`}
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
