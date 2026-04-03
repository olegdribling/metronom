import { useTheme } from '../ThemeContext'
import { Icon } from './Icon'

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const TABS = [
  { id: 'metronome', label: 'Метроном', icon: 'metronome' },
  { id: 'songs',     label: 'Песни',    icon: 'music-note' },
  { id: 'settings',  label: 'Настройки', icon: 'gear' },
]

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const theme = useTheme()
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 flex ${theme.navBg}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            activeTab === tab.id ? theme.navActive : theme.navInactive
          }`}
        >
          <Icon name={tab.icon} className="text-xl" />
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
