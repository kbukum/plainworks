"use client"

// Re-export-only barrel for the settings data: the form schema, field copy, and the save mutation.
export {
  ITEMS_PER_PAGE_MAX,
  ITEMS_PER_PAGE_MIN,
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from "./settings-fields"
export {
  notificationsFormSchema,
  preferencesFormSchema,
  profileFormSchema,
} from "./settings-schema"
export { useSettingsMutation } from "./use-settings-mutation"
