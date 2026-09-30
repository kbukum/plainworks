"use client"

import { useDocumentMotion } from "@plainworks/theme/client"
import { useToast } from "@plainworks/ui/feedback/toast"
import type { ReactElement, ReactNode } from "react"
import { useLocalPreferences } from "./local-preferences"

function MotionPreferenceRoot({ children }: { readonly children: ReactNode }): ReactElement {
  useDocumentMotion(useLocalPreferences((state) => state.motion))
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
