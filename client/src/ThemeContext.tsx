import { createContext, useContext, ReactNode } from 'react'
import { THEMES, Theme } from './theme'
import { ThemeKey } from './types'

const ThemeContext = createContext<Theme>(THEMES.purple)

export function ThemeProvider({ children, themeId }: { children: ReactNode; themeId: ThemeKey }) {
  return (
    <ThemeContext.Provider value={THEMES[themeId] ?? THEMES.purple}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
