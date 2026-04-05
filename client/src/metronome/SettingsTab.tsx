import { useState } from 'react'
import { useTheme } from '../ThemeContext'
import { THEMES } from '../theme'
import { ThemeKey } from '../types'
import { Icon } from './Icon'

interface SettingsTabProps {
  themeId: ThemeKey
  setThemeId: (id: ThemeKey) => void
  voiceCues: boolean
  setVoiceCues: (v: boolean) => void
  onLogout: () => void
}

export function SettingsTab({ themeId, setThemeId, voiceCues, setVoiceCues, onLogout }: SettingsTabProps) {
  const theme = useTheme()
  const [view, setView] = useState<'main' | 'theme'>('main')

  if (view === 'theme') {
    return (
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('main')} className={`p-2 rounded-xl ${theme.btn}`}>
            <Icon name="arrow-left" />
          </button>
          <h2 className="text-xl font-bold">Color scheme</h2>
        </div>

        <div className="space-y-3">
          {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([id, scheme]) => {
            const isActive = id === themeId
            return (
              <button
                key={id}
                onClick={() => setThemeId(id)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition flex items-center gap-4 ${
                  isActive ? 'border-white/60 bg-white/5' : theme.btn + ' border-transparent'
                }`}
              >
                <div className="flex gap-1.5 shrink-0">
                  {scheme.preview.map((cls, i) => (
                    <div key={i} className={`w-5 h-5 rounded-full ${cls} border border-white/10`} />
                  ))}
                </div>
                <span className={`font-semibold flex-1 ${theme.text}`}>{scheme._name}</span>
                {isActive && <Icon name="check-circle" className={`text-xl ${theme.textAccent}`} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl">
      <h2 className="text-xl font-bold mb-4">Settings</h2>

      <div className={`${theme.card} overflow-hidden`}>
        <button
          onClick={() => setView('theme')}
          className={`w-full flex items-center gap-3 p-4 transition ${theme.btn} border-0 rounded-none border-b ${theme.borderStrong}`}
        >
          <Icon name="palette" className={`text-lg ${theme.textAccent}`} />
          <span className="flex-1 text-left font-medium">Color scheme</span>
          <span className={`text-sm mr-2 ${theme.textSub}`}>{THEMES[themeId]._name}</span>
          <Icon name="caret-right" className={theme.textSub} />
        </button>

        <button
          onClick={() => setVoiceCues(!voiceCues)}
          className={`w-full flex items-center gap-3 p-4 transition ${theme.btn} border-0 rounded-none border-b ${theme.borderStrong}`}
        >
          <Icon name="microphone" className={`text-lg ${theme.textAccent}`} />
          <span className="flex-1 text-left font-medium">Voice cues</span>
          <div className={`w-10 h-6 rounded-full transition-colors ${voiceCues ? 'bg-violet-600' : 'bg-gray-400'} relative`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${voiceCues ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>

        <div className={`w-full flex items-center gap-3 p-4 opacity-40 border-b ${theme.borderStrong}`}>
          <Icon name="bell" className="text-lg" />
          <span className="flex-1 text-left font-medium">Notifications</span>
          <span className={`text-sm ${theme.textSub}`}>Soon</span>
        </div>

        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 p-4 transition ${theme.btn} border-0 rounded-none ${theme.textDanger}`}
        >
          <Icon name="sign-out" className="text-lg" />
          <span className="flex-1 text-left font-medium">Выйти</span>
        </button>
      </div>
    </div>
  )
}
