'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  actualTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function resolveTheme(themeMode: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  if (themeMode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return themeMode
}

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem('theme') as ThemeMode) || 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme)
  const actualTheme = useMemo(() => resolveTheme(theme), [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', actualTheme)
  }, [actualTheme])

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme)
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
