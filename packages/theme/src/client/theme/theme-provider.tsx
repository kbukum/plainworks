"use client"

import { ensureError, type StateSource } from "@plainworks/std"
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react"
import { DEFAULT_THEME, resolveTheme, type ThemePreference } from "../../theme"

export interface ThemeContextValue {
  readonly error: Error | undefined
  /** The mode actually applied to the document — `system` resolved against the OS preference. */
  readonly resolvedMode: "light" | "dark"
  readonly theme: ThemePreference
  readonly setTheme: (theme: ThemePreference) => Promise<void>
}

export interface ThemeProviderProps {
  readonly children: ReactNode
  readonly source: StateSource<ThemePreference>
  readonly initialTheme?: ThemePreference
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function applyTheme(theme: ThemePreference, systemPrefersDark: boolean): void {
  const resolved = resolveTheme(theme, systemPrefersDark)
  const themeClasses = Array.from(document.documentElement.classList).filter((name) =>
    name.startsWith("theme-"),
  )
  document.documentElement.classList.remove("dark", ...themeClasses)
  document.documentElement.classList.add(...resolved.htmlClass.split(" ").filter(Boolean))
  document.documentElement.style.colorScheme = resolved.colorScheme
}

/** Own a theme source for one mounted application and keep system preference subscriptions bounded. */
export function ThemeProvider({
  children,
  source,
  initialTheme = DEFAULT_THEME,
}: ThemeProviderProps): ReactElement {
  const [theme, setThemeValue] = useState(initialTheme)
  const [error, setError] = useState<Error>()
  // Start light so server and first client render agree; the effect reconciles the OS preference.
  const [systemPrefersDark, setSystemPrefersDark] = useState(false)

  useEffect(() => {
    let active = true
    // Generation guard: every refresh shares one abort controller, and overlapping reads resolve
    // in completion order — only the newest read may commit, so a stale completion can never
    // overwrite a newer theme or clear its error state.
    let generation = 0
    const controller = new AbortController()
    const refresh = async (): Promise<void> => {
      const ticket = ++generation
      try {
        const stored = await source.get(controller.signal)
        if (active && ticket === generation && stored !== undefined) {
          setThemeValue(stored)
          setError(undefined)
        }
      } catch (cause) {
        if (active && ticket === generation) {
          setError(ensureError(cause))
        }
      }
    }
    const subscription = source.subscribe(() => {
      void refresh()
    })
    void refresh()
    return () => {
      active = false
      controller.abort()
      subscription.unsubscribe()
    }
  }, [source])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const update = (): void => setSystemPrefersDark(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    applyTheme(theme, systemPrefersDark)
  }, [theme, systemPrefersDark])

  const resolvedMode = resolveTheme(theme, systemPrefersDark).colorScheme

  const setTheme = async (next: ThemePreference): Promise<void> => {
    try {
      await source.set(next)
      setThemeValue(next)
      setError(undefined)
    } catch (cause) {
      const nextError = ensureError(cause)
      setError(nextError)
      throw nextError
    }
  }

  return (
    <ThemeContext.Provider value={{ error, resolvedMode, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used inside ThemeProvider.")
  }
  return context
}
