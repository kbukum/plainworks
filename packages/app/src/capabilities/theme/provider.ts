"use client"

import { ensureError } from "@plainworks/std"
import { AbortError } from "@plainworks/std/resilience"
import { createSourceReconciler, type StateSource } from "@plainworks/std/seam"
import { ThemeProvider, useDocumentMotion } from "@plainworks/theme/client"
import {
  DEFAULT_MOTION,
  DEFAULT_THEME,
  type MotionPreference,
  type ThemePreference,
  themePreferenceOf,
} from "@plainworks/theme/preference"
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { type ClientCapability, defineProvider } from "../../client/capability"
import { AppContextError } from "../../errors"
import { THEME_CAPABILITY_ID } from "./resolver"

/** Options for {@link createThemeCapability}. */
export interface ThemeCapabilityOptions {
  /**
   * Where the user's theme is kept. Use a source the server can read, such as `cookieScope` from
   * `@plainworks/state/cookie`, so `createThemeResolver` sees the same choice on the next request.
   */
  readonly source: StateSource<ThemePreference>
  /** The theme used when the server slice is absent or invalid; defaults to `DEFAULT_THEME`. */
  readonly fallback?: ThemePreference
  /** The capability id; defaults to {@link THEME_CAPABILITY_ID}. */
  readonly id?: string
}

/**
 * The client half of the theme recipe. It mounts `ThemeProvider` from `@plainworks/theme/client`
 * with the server-resolved theme, so the first client render matches the server, and keeps later
 * choices in `source`. Read and change the theme below it with `useTheme`.
 */
export function createThemeCapability(options: ThemeCapabilityOptions): ClientCapability {
  const { source, fallback = DEFAULT_THEME, id = THEME_CAPABILITY_ID } = options
  return defineProvider({
    id,
    provider: ({ resolved, children }) =>
      createElement(ThemeProvider, {
        source,
        initialTheme: themePreferenceOf(resolved, fallback),
        children,
      }),
  })
}

/** The motion choice below a motion capability. */
export interface MotionState {
  /** The current choice. It starts at `"system"` and adopts the stored choice once read. */
  readonly motion: MotionPreference
  /** The last failure to read or save the choice, cleared by the next success. */
  readonly error: Error | undefined
  /** Save a new choice. Rejects when the source fails; the previous choice stays in place. */
  readonly setMotion: (motion: MotionPreference) => Promise<void>
}

/** Options for {@link createMotionCapability}. */
export interface MotionCapabilityOptions {
  /**
   * Where the user's motion choice is kept. It belongs to the device, so a browser-storage source
   * such as `persistentScope` from `@plainworks/state/web-storage` fits.
   */
  readonly source: StateSource<MotionPreference>
  /** The capability id; defaults to `"motion"`. */
  readonly id?: string
}

// A React context, not state: each motion capability mounts its own provider and value.
const MotionContext = createContext<MotionState | null>(null)

interface MotionProviderProps {
  readonly source: StateSource<MotionPreference>
  readonly children: ReactNode
}

function MotionProvider({ source, children }: MotionProviderProps): ReactNode {
  const [motion, setMotionValue] = useState<MotionPreference>(DEFAULT_MOTION)
  const [error, setError] = useState<Error>()
  const reconciler = useMemo(
    () =>
      createSourceReconciler<MotionPreference>({
        source,
        adopt: (value) => {
          setMotionValue(value)
          setError(undefined)
        },
        reset: () => {
          setMotionValue(DEFAULT_MOTION)
          setError(undefined)
        },
        report: (cause) => setError(ensureError(cause)),
      }),
    [source],
  )
  useEffect(() => reconciler.start(), [reconciler])
  useDocumentMotion(motion)

  const setMotion = async (next: MotionPreference): Promise<void> => {
    try {
      await reconciler.set(next)
      setMotionValue(next)
      setError(undefined)
    } catch (cause) {
      const failure = ensureError(cause)
      if (!(failure instanceof AbortError)) setError(failure)
      throw failure
    }
  }

  return createElement(MotionContext.Provider, { value: { motion, error, setMotion }, children })
}

/**
 * The motion half of the preference recipe. It keeps the user's motion choice in `source` and
 * hands it to `useDocumentMotion` from `@plainworks/theme/client`, which writes `data-motion` for
 * the theme stylesheet. With no stored choice, motion follows the device's reduced-motion setting.
 * Read and change the choice below it with {@link useMotion}.
 */
export function createMotionCapability(options: MotionCapabilityOptions): ClientCapability {
  const { source, id = "motion" } = options
  return defineProvider({
    id,
    provider: ({ children }) => createElement(MotionProvider, { source, children }),
  })
}

/**
 * Read and change the motion choice kept by the nearest motion capability.
 *
 * @throws {AppContextError} When called outside a motion capability.
 */
export function useMotion(): MotionState {
  const value = useContext(MotionContext)
  if (value === null) {
    throw new AppContextError("useMotion must be called inside a motion capability.")
  }
  return value
}
