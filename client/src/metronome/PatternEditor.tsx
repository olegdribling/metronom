import { useMemo } from 'react'
import { useTheme } from '../ThemeContext'
import { Pattern } from '../types'

interface PatternEditorProps {
  songName: string
  pattern: Pattern
  currentStep: number
  onToggleStep: (trackId: string, stepIdx: number) => void
  onClose: () => void
  onClear: () => void
}

export function PatternEditor({
  songName, pattern, currentStep,
  onToggleStep, onClose, onClear,
}: PatternEditorProps) {
  const theme = useTheme()

  const headerCells = useMemo(
    () => Array.from({ length: pattern.steps }).map((_, idx) => ({ label: idx + 1, idx })),
    [pattern.steps]
  )

  const gridTemplate = {
    gridTemplateColumns: `80px repeat(${pattern.steps}, minmax(2rem, 1fr))`,
  }

  return (
    <div className={`min-h-screen p-4 ${theme.page}`}>
      <div className={`max-w-4xl mx-auto p-6 ${theme.card}`}>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <span className={`text-sm font-medium ${theme.textSub}`}>{songName || 'Паттерн'}</span>
          <div className="flex gap-3">
            <button
              onClick={onClear}
              className={`px-4 py-2 rounded-xl ${theme.btn} text-slate-300`}
            >
              Очистить
            </button>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl font-bold ${theme.btnAccent} text-white`}
            >
              Готово
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-auto">
          <div className="grid gap-2 items-center" style={gridTemplate}>
            <div />
            {headerCells.map(cell => (
              <div key={cell.idx} className={`text-xs text-center ${theme.textSub}`}>
                {cell.label}
              </div>
            ))}
            {pattern.tracks.map(track => (
              <div key={track.id} style={{ display: 'contents' }}>
                <div className={`font-mono text-sm pr-2 text-right ${theme.textSub}`}>
                  {track.name}
                </div>
                {track.steps.map((active, idx) => {
                  const isCurrent = idx === currentStep
                  return (
                    <button
                      key={idx}
                      className={`h-10 rounded-lg transition ${
                        active ? 'border-transparent' : theme.stepOff
                      } ${isCurrent ? theme.stepCurrent : ''}`}
                      style={{ backgroundColor: active ? track.color : undefined }}
                      onClick={() => onToggleStep(track.id, idx)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
