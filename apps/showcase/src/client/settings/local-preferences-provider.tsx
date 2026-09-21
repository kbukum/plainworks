"use client"

import type { ReactElement, ReactNode } from "react"
import { useEffect } from "react"
import { useToast } from "../feedback"
import { useLocalPreferences } from "./local-preferences"

function MotionPreferenceRoot({ children }: { readonly children: ReactNode }): ReactElement {
  const motion = useLocalPreferences((state) => state.motion)

  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.motion
    root.dataset.motion = motion
    return () => {
      if (previous === undefined) {
        delete root.dataset.motion
      } else {
        root.dataset.motion = previous
      }
    }
  }, [motion])

  return <>{children}</>
}

/** Owns device-local preferences, root effects, and user-visible persistence errors. */
export function LocalPreferencesProvider({
  children,
}: {
  readonly children: ReactNode
}): ReactElement {
  const toast = useToast()

  return (
    <useLocalPreferences.Provider
      onError={() => toast.error("Your device preferences could not be saved")}
    >
      <MotionPreferenceRoot>{children}</MotionPreferenceRoot>
    </useLocalPreferences.Provider>
  )
}
