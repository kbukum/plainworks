// The `UserSettings` runtime shape in one server-safe place — a sound guard the settings read
// narrows an untrusted response through, so a malformed settings record can never cross as a typed
// `UserSettings`. Neutral: it names no host global.

import type { SettingsNotifications, SettingsPrivacy, UserSettings } from "@plainworks/demo"
import { isSettingsPreferences, isSettingsProfile } from "@plainworks/demo"
import { guardSchema, isNonEmptyString, isRecord } from "@plainworks/std"

function isNotifications(value: unknown): value is SettingsNotifications {
  return (
    isRecord(value) &&
    typeof value.email === "boolean" &&
    typeof value.push === "boolean" &&
    typeof value.sms === "boolean"
  )
}

function isPrivacy(value: unknown): value is SettingsPrivacy {
  return (
    isRecord(value) &&
    typeof value.profileVisible === "boolean" &&
    typeof value.showEmail === "boolean"
  )
}

/** A sound {@link UserSettings} guard: an identity plus every group present and well-typed. */
export function isUserSettings(value: unknown): value is UserSettings {
  return (
    isRecord(value) &&
    isNonEmptyString(value.userId) &&
    isSettingsProfile(value.profile) &&
    isSettingsPreferences(value.preferences) &&
    isNotifications(value.notifications) &&
    isPrivacy(value.privacy)
  )
}

/** The validated response envelope shared by settings reads and writes. */
export const settingsEnvelopeSchema = guardSchema<{ readonly data: UserSettings }>(
  (value): value is { readonly data: UserSettings } =>
    isRecord(value) && isUserSettings(value.data),
  "response is not a { data: UserSettings } envelope",
)
