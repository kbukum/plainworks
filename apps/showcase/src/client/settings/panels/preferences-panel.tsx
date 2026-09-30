"use client"

import type { UpdateSettingsInput } from "@plainworks/demo"
import { useToast } from "@plainworks/ui/feedback/toast"
import { Form } from "@plainworks/ui/forms/form"
import { NumberField } from "@plainworks/ui/forms/number-field"
import { SelectField } from "@plainworks/ui/forms/select-field"
import type { ReactElement } from "react"
import {
  ITEMS_PER_PAGE_MAX,
  ITEMS_PER_PAGE_MIN,
  LANGUAGE_OPTIONS,
  preferencesFormSchema,
  TIMEZONE_OPTIONS,
} from "../data"
import { PanelActions, type SettingsPanelProps } from "./settings-panel"

/**
 * The Preferences panel: regional and list preferences. It exercises the kit's select and number
 * fields — an unknown language or a page size outside the accepted window is rejected inline before
 * the save.
 */
export function PreferencesPanel({ settings, save }: SettingsPanelProps): ReactElement {
  const toast = useToast()

  const onSubmit = async (input: UpdateSettingsInput): Promise<void> => {
    const saved = await save(input)
    if (saved) {
      toast.success("Preferences saved")
    } else {
      toast.error("Your preferences could not be saved")
    }
  }

  return (
    <Form
      key={JSON.stringify(settings.preferences)}
      schema={preferencesFormSchema()}
      onSubmit={onSubmit}
      className="@container grid gap-4"
    >
      <div className="grid gap-4 @sm:grid-cols-2">
        <SelectField
          name="language"
          label="Language"
          options={LANGUAGE_OPTIONS}
          defaultValue={settings.preferences.language}
        />
        <SelectField
          name="timezone"
          label="Timezone"
          options={TIMEZONE_OPTIONS}
          defaultValue={settings.preferences.timezone}
        />
      </div>
      <NumberField
        name="itemsPerPage"
        label="Rows per page"
        description={`Between ${ITEMS_PER_PAGE_MIN} and ${ITEMS_PER_PAGE_MAX}.`}
        min={ITEMS_PER_PAGE_MIN}
        max={ITEMS_PER_PAGE_MAX}
        step={1}
        defaultValue={settings.preferences.itemsPerPage}
      />
      <PanelActions label="Save preferences" />
    </Form>
  )
}
