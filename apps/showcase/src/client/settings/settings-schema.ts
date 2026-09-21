import {
  decodeSettingsPreferencesUpdate,
  decodeSettingsProfileUpdate,
  type UpdateSettingsInput,
} from "@plainworks/demo"
import { isRecord, type StandardSchemaV1 } from "@plainworks/std"

// The panel forms submit through the kit `Form`, so each field arrives as a string (or, for a
// checkbox/switch, is present as `"on"` when on and absent when off). Each schema below decodes one
// group of an `UpdateSettingsInput` at that boundary and reports any failure on the field's own
// path so the kit renders the message inline. Owning them app-locally keeps the showcase free of a
// validation dependency while staying assignable wherever a `StandardSchemaV1` is expected — the
// same contract Zod or Valibot would satisfy.

type Issue = { message: string; path: [string] }

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

// A checkbox/switch submits its name only when on, so presence is the boolean.
function checked(value: unknown): boolean {
  return value !== undefined
}

function schema<Output>(
  validate: (values: Record<string, unknown>) => { value: Output } | { issues: Issue[] },
): StandardSchemaV1<unknown, Output> {
  return {
    "~standard": {
      version: 1,
      vendor: "showcase",
      validate: (input) => validate(isRecord(input) ? input : {}),
    },
  }
}

/** Validate the Profile panel: a required display name plus optional free-text and start date. */
export function profileFormSchema(): StandardSchemaV1<unknown, UpdateSettingsInput> {
  return schema((values) => {
    const profile = decodeSettingsProfileUpdate({
      displayName: values.displayName,
      jobTitle: values.jobTitle,
      bio: values.bio,
      startDate: values.startDate,
    })
    return "issues" in profile
      ? { issues: [...profile.issues] }
      : { value: { profile: profile.value } }
  })
}

/** Validate the Preferences panel: a known language and timezone, and a bounded page size. */
export function preferencesFormSchema(): StandardSchemaV1<unknown, UpdateSettingsInput> {
  return schema((values) => {
    const itemsPerPage = Number(trimmed(values.itemsPerPage))
    const preferences = decodeSettingsPreferencesUpdate({
      language: values.language,
      timezone: values.timezone,
      itemsPerPage,
    })
    return "issues" in preferences
      ? { issues: [...preferences.issues] }
      : { value: { preferences: preferences.value } }
  })
}

/** Validate the Notifications panel: the per-channel switches and the privacy checkboxes. */
export function notificationsFormSchema(): StandardSchemaV1<unknown, UpdateSettingsInput> {
  return schema((values) => ({
    value: {
      notifications: {
        email: checked(values.email),
        push: checked(values.push),
        sms: checked(values.sms),
      },
      privacy: {
        profileVisible: checked(values.profileVisible),
        showEmail: checked(values.showEmail),
      },
    },
  }))
}
