import { ThemeKey } from '../types'
import { SettingsTab } from '../metronome/SettingsTab'

interface SettingsPageProps {
  themeId: ThemeKey
  setThemeId: (id: ThemeKey) => void
  voiceCues: boolean
  setVoiceCues: (v: boolean) => void
  onLogout: () => void
}

// Русский комментарий: отдельная страница настроек приложения.
export function SettingsPage(props: SettingsPageProps) {
  return <SettingsTab {...props} />
}
