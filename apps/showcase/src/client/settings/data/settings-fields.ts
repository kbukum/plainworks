// The option vocabularies the settings panels present — the select choices and the rows-per-page
// bounds — in one server-safe place so a form control and its
// schema validate against the same set. Neutral: it names no host global.

import {
  SETTINGS_LANGUAGE_VALUES,
  SETTINGS_TIMEZONE_VALUES,
  type SettingsLanguage,
  type SettingsTimezone,
} from "@plainworks/demo"
import type { SelectFieldOption } from "@plainworks/ui/forms/select-field"

export {
  SETTINGS_ITEMS_PER_PAGE_MAX as ITEMS_PER_PAGE_MAX,
  SETTINGS_ITEMS_PER_PAGE_MIN as ITEMS_PER_PAGE_MIN,
} from "@plainworks/demo"

/** Language choices offered by the Preferences panel. */
const LANGUAGE_LABELS: Readonly<Record<SettingsLanguage, string>> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
}

export const LANGUAGE_OPTIONS: readonly SelectFieldOption[] = SETTINGS_LANGUAGE_VALUES.map(
  (value) => ({ value, label: LANGUAGE_LABELS[value] }),
)

/** Timezone choices offered by the Preferences panel. */
const TIMEZONE_LABELS: Readonly<Record<SettingsTimezone, string>> = {
  "America/New_York": "New York (Eastern)",
  "America/Chicago": "Chicago (Central)",
  "America/Los_Angeles": "Los Angeles (Pacific)",
  "Europe/London": "London (GMT)",
  "Europe/Berlin": "Berlin (CET)",
  "Asia/Tokyo": "Tokyo (JST)",
}

export const TIMEZONE_OPTIONS: readonly SelectFieldOption[] = SETTINGS_TIMEZONE_VALUES.map(
  (value) => ({ value, label: TIMEZONE_LABELS[value] }),
)
