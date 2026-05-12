import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'searcharr-theme'

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
}

const listeners = new Set<() => void>()
let currentTheme: Theme = readStoredTheme()
// Keep the DOM in sync with what we loaded (the inline script in index.html
// already did this on first paint; this covers hot reloads and edge cases).
applyTheme(currentTheme)

function setTheme(theme: Theme): void {
  if (theme === currentTheme) return
  currentTheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore storage failures (private mode, etc.) — the theme still applies for this session.
  }
  applyTheme(theme)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Reads and controls the active UI theme. The choice is persisted to
 * localStorage and reflected as the `light` class on the document element.
 */
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme,
    () => 'dark' as Theme,
  )

  const toggleTheme = useCallback(() => {
    setTheme(currentTheme === 'light' ? 'dark' : 'light')
  }, [])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}
