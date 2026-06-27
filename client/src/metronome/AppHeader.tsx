import { Icon } from './Icon'
import { useTheme } from '../ThemeContext'

interface AppHeaderProps {
  title: string
  showBack: boolean
  onBack: () => void
}

// Русский комментарий: общий хедер для всех рабочих экранов приложения.
export function AppHeader({ title, showBack, onBack }: AppHeaderProps) {
  // Русский комментарий: подключаем текущую тему, чтобы не хардкодить цвета в хедере.
  const theme = useTheme()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-4 pt-[max(env(safe-area-inset-top),0px)]">
      <div className="mx-auto max-w-xl h-16 flex items-center justify-between">
        <h2 className="text-xl font-bold truncate flex-1">{title}</h2>
        {showBack && (
          <button
            onClick={onBack}
            className={`px-3 py-2 rounded-2xl ml-3 flex items-center gap-1 text-sm ${theme.btn}`}
          >
            <Icon name="arrow-left" /> Назад
          </button>
        )}
      </div>
    </header>
  )
}
