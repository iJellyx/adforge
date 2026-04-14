'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'dark' | 'light'
type ThemeContextType = { theme: Theme; toggleTheme: () => void }

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggleTheme: () => {} })

export function useTheme() { return useContext(ThemeContext) }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('adforge-theme') as Theme | null
    const initial = saved || 'dark'
    setTheme(initial)
    if (initial === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
    setMounted(true)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('adforge-theme', next)
    if (next === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }

  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
