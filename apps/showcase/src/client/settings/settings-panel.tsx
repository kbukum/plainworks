"use client"

import type { UpdateSettingsInput, UserSettings } from "@plainworks/demo"
import { FormSubmit } from "@plainworks/ui/forms"
import type { ReactElement } from "react"
import type { SettingsMutationResult } from "./use-settings-mutation"

/** Props shared by every server-backed settings panel — the current record and the save action. */
export interface SettingsPanelProps {
  /** The user's current settings, seeding each field's default value. */
  readonly settings: UserSettings
  /** Persist a partial update and raise the save toast; resolves with the outcome. */
  readonly save: (input: UpdateSettingsInput) => Promise<SettingsMutationResult>
}

/** The right-aligned submit row every panel form ends with; stays pending until the save settles. */
export function PanelActions({ label }: { readonly label: string }): ReactElement {
  return (
    <div className="mt-2 flex justify-end">
      <FormSubmit>{label}</FormSubmit>
    </div>
  )
}
