"use client"

import type { UpdateSettingsInput } from "@plainworks/demo"
import { DateField, Form, TextareaField, TextField } from "@plainworks/ui/forms"
import type { ReactElement } from "react"
import { useToast } from "../feedback"
import { PanelActions, type SettingsPanelProps } from "./settings-panel"
import { profileFormSchema } from "./settings-schema"

/**
 * The Profile panel: the free-text identity a user presents plus a start date. It exercises the
 * kit's text, textarea, and date fields, each with inline validation — a missing display name or a
 * malformed date blocks the save and keeps every entered value.
 */
export function ProfilePanel({ settings, save }: SettingsPanelProps): ReactElement {
  const toast = useToast()

  const onSubmit = async (input: UpdateSettingsInput): Promise<void> => {
    const outcome = await save(input)
    if (outcome === "success") {
      toast.success("Profile saved")
    } else if (outcome === "failure") {
      toast.error("Your profile could not be saved")
    }
  }

  return (
    <Form
      key={JSON.stringify(settings.profile)}
      schema={profileFormSchema()}
      onSubmit={onSubmit}
      className="@container grid gap-4"
    >
      <div className="grid gap-4 @sm:grid-cols-2">
        <TextField
          name="displayName"
          label="Display name"
          required
          defaultValue={settings.profile.displayName}
          placeholder="Ada Lovelace"
        />
        <TextField
          name="jobTitle"
          label="Job title"
          defaultValue={settings.profile.jobTitle}
          placeholder="Product Engineer"
        />
      </div>
      <TextareaField
        name="bio"
        label="Bio"
        defaultValue={settings.profile.bio}
        placeholder="A sentence or two about you"
      />
      <DateField name="startDate" label="Start date" defaultValue={settings.profile.startDate} />
      <PanelActions label="Save profile" />
    </Form>
  )
}
