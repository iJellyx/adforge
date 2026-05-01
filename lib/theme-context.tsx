'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'dark' | 'light'
type ThemeContextType = { theme: Theme; toggleTheme: () => void }

// Light is now the default (AdSplit-style paper aesthetic). Dark remains
// available via toggle and is applied by adding `.dark` to <html>.
const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {} })

export function useTheme() { return useContext(ThemeContext) }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('adforge-theme') as Theme | null
    const initial = saved || 'light'
    setTheme(initial)
    // Light is the default — no class needed. Dark is opt-in via `.dark`.
    document.documentElement.classList.remove('light') // legacy class is now a no-op
    if (initial === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    setMounted(true)
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('adforge-theme', next)
    if (next === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }

  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
