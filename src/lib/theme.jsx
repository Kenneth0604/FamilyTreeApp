import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const THEMES = [
  { id: 'blossom', name: '粉粉', desc: '粉紅 × 薰衣草', swatch: ['#e86aa8', '#a78bfa', '#fbf4f8'], themeColor: '#e86aa8' },
  { id: 'graphite', name: '黑黑', desc: '黑灰色系', swatch: ['#1b1e23', '#8b93a1', '#e5e7eb'], themeColor: '#1b1e23' },
]

const KEY = 'familytree:theme'
const ThemeContext = createContext(null)

function readTheme() {
  try {
    const v = localStorage.getItem(KEY)
    if (THEMES.some((t) => t.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'blossom'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    const def = THEMES.find((t) => t.id === theme)
    if (meta && def) meta.setAttribute('content', def.themeColor)
  }, [theme])

  const setTheme = useCallback((id) => {
    setThemeState(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
