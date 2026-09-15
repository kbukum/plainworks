"use client"

import { createSourceReconciler, ensureError, type StateSource } from "@plainworks/std"
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ThemeError } from "../errors"
import { DEFAULT_THEME, resolveTheme, type ThemePreference } from "../theme"

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

  // Reset targets the *current* initial without rebuilding the reconciler when only the prop moves.
  const initialThemeRef = useRef(initialTheme)
  initialThemeRef.current = initialTheme

  // One shared reconciler per source owns the read races (latest-wins, local-write, external
  // removal) so the provider no longer hand-rolls a generation guard. A local `setTheme` marks its
  // write so an in-flight read cannot clobber the fresher value; an external clear resets to the
  // configured initial instead of stranding a stale theme.
  const reconciler = useMemo(
    () =>
      createSourceReconciler<ThemePreference>({
        source,
        adopt: (value) => {
          setThemeValue(value)
          setError(undefined)
        },
        reset: () => setThemeValue(initialThemeRef.current),
        report: (cause) => setError(ensureError(cause)),
      }),
    [source],
  )

  useEffect(() => reconciler.start(), [reconciler])

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
    // Mark the write before persisting so a read already in flight is discarded rather than
    // clobbering this fresher value when it resolves.
    reconciler.markLocalWrite()
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
    throw new ThemeError("useTheme must be used inside ThemeProvider.")
  }
  return context
}
