/**
 * Settings-related types
 */

import { isOneOf, isRecord } from "@plainworks/std"

/** Inclusive rows-per-page bounds shared by settings clients and handlers. */
export const SETTINGS_ITEMS_PER_PAGE_MIN = 5
export const SETTINGS_ITEMS_PER_PAGE_MAX = 100

/** Whether a value is a supported settings page size. */
export function isSettingsItemsPerPage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SETTINGS_ITEMS_PER_PAGE_MIN &&
    value <= SETTINGS_ITEMS_PER_PAGE_MAX
  )
}

/** Language codes accepted by the settings contract. */
export const SETTINGS_LANGUAGE_VALUES = ["en", "es", "fr", "de", "ja"] as const

/** Timezone identifiers accepted by the settings contract. */
export const SETTINGS_TIMEZONE_VALUES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
] as const

export type SettingsLanguage = (typeof SETTINGS_LANGUAGE_VALUES)[number]
export type SettingsTimezone = (typeof SETTINGS_TIMEZONE_VALUES)[number]

/** The editable profile a user presents — free-text identity fields plus a start date. */
export interface SettingsProfile {
  displayName: string
  jobTitle: string
  bio: string
  /** ISO calendar date (`YYYY-MM-DD`); empty when unset. */
  startDate: string
}

/** Regional and list preferences that shape how the app presents data. */
export interface SettingsPreferences {
  language: SettingsLanguage
  timezone: SettingsTimezone
  /** Rows a paginated list shows per page; a positive integer within a sane bound. */
  itemsPerPage: number
}

/** Per-channel notification opt-ins. */
export interface SettingsNotifications {
  email: boolean
  push: boolean
  sms: boolean
}

/** Profile-visibility choices. */
export interface SettingsPrivacy {
  profileVisible: boolean
  showEmail: boolean
}

/** A user's application settings — grouped so a form panel maps to exactly one group. */
export interface UserSettings {
  userId: string
  profile: SettingsProfile
  preferences: SettingsPreferences
  notifications: SettingsNotifications
  privacy: SettingsPrivacy
}

/** Client input for updating settings; every group merges shallowly over the stored value. */
export interface UpdateSettingsInput {
  profile?: Partial<SettingsProfile>
  preferences?: Partial<SettingsPreferences>
  notifications?: Partial<SettingsNotifications>
  privacy?: Partial<SettingsPrivacy>
}

/** A field-level profile validation issue suitable for form and API boundaries. */
export interface SettingsProfileIssue {
  readonly path: [keyof SettingsProfile]
  readonly message: string
}

/** The result of decoding a partial profile update. */
export type SettingsProfileDecodeResult =
  | { readonly value: Partial<SettingsProfile> }
  | { readonly issues: readonly SettingsProfileIssue[] }

/** A field-level preferences validation issue suitable for form and API boundaries. */
export interface SettingsPreferencesIssue {
  readonly path: [keyof SettingsPreferences]
  readonly message: string
}

/** The result of decoding a partial preferences update. */
export type SettingsPreferencesDecodeResult =
  | { readonly value: Partial<SettingsPreferences> }
  | { readonly issues: readonly SettingsPreferencesIssue[] }

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Decode and normalize an untrusted partial profile at either side of the HTTP boundary. */
export function decodeSettingsProfileUpdate(value: unknown): SettingsProfileDecodeResult {
  if (!isRecord(value)) {
    return { issues: [{ path: ["displayName"], message: "Profile must be an object." }] }
  }

  const profile: Partial<SettingsProfile> = {}
  const issues: SettingsProfileIssue[] = []
  const stringFields = ["displayName", "jobTitle", "bio", "startDate"] as const
  for (const field of stringFields) {
    const candidate = value[field]
    if (candidate === undefined) continue
    if (typeof candidate !== "string") {
      issues.push({ path: [field], message: "Enter text." })
      continue
    }
    profile[field] = candidate.trim()
  }

  if (profile.displayName !== undefined && profile.displayName.length === 0) {
    issues.push({ path: ["displayName"], message: "Display name is required." })
  }
  if (
    profile.startDate !== undefined &&
    profile.startDate.length > 0 &&
    !isIsoCalendarDate(profile.startDate)
  ) {
    issues.push({ path: ["startDate"], message: "Enter a valid date." })
  }

  return issues.length > 0 ? { issues } : { value: profile }
}

/** Whether an untrusted value is a complete, semantically valid settings profile. */
export function isSettingsProfile(value: unknown): value is SettingsProfile {
  if (
    !isRecord(value) ||
    typeof value.displayName !== "string" ||
    typeof value.jobTitle !== "string" ||
    typeof value.bio !== "string" ||
    typeof value.startDate !== "string"
  ) {
    return false
  }
  return !("issues" in decodeSettingsProfileUpdate(value))
}

/** Decode an untrusted partial preferences update against the shared accepted values. */
export function decodeSettingsPreferencesUpdate(value: unknown): SettingsPreferencesDecodeResult {
  if (!isRecord(value)) {
    return { issues: [{ path: ["language"], message: "Preferences must be an object." }] }
  }

  const preferences: Partial<SettingsPreferences> = {}
  const issues: SettingsPreferencesIssue[] = []

  if (value.language !== undefined) {
    if (isOneOf(value.language, SETTINGS_LANGUAGE_VALUES)) {
      preferences.language = value.language
    } else {
      issues.push({ path: ["language"], message: "Choose a supported language." })
    }
  }
  if (value.timezone !== undefined) {
    if (isOneOf(value.timezone, SETTINGS_TIMEZONE_VALUES)) {
      preferences.timezone = value.timezone
    } else {
      issues.push({ path: ["timezone"], message: "Choose a supported timezone." })
    }
  }
  if (value.itemsPerPage !== undefined) {
    if (isSettingsItemsPerPage(value.itemsPerPage)) {
      preferences.itemsPerPage = value.itemsPerPage
    } else {
      issues.push({
        path: ["itemsPerPage"],
        message: `Enter a whole number between ${SETTINGS_ITEMS_PER_PAGE_MIN} and ${SETTINGS_ITEMS_PER_PAGE_MAX}.`,
      })
    }
  }

  return issues.length > 0 ? { issues } : { value: preferences }
}

/** Whether an untrusted value is a complete, semantically valid settings preference group. */
export function isSettingsPreferences(value: unknown): value is SettingsPreferences {
  if (
    !isRecord(value) ||
    value.language === undefined ||
    value.timezone === undefined ||
    value.itemsPerPage === undefined
  ) {
    return false
  }
  return !("issues" in decodeSettingsPreferencesUpdate(value))
}

/** Authorize one settings request at the host boundary. */
export type SettingsRequestAuthorizer = (request: Request) => boolean | Promise<boolean>
