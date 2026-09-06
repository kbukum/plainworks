/**
 * Settings-related types
 */

/** A user's application settings. */
export interface UserSettings {
  userId: string
  theme: "light" | "dark" | "system"
  language: string
  timezone: string
  notifications: {
    email: boolean
    push: boolean
    sms: boolean
  }
  privacy: {
    profileVisible: boolean
    showEmail: boolean
  }
}

/** Client input for updating settings; nested groups merge shallowly. */
export interface UpdateSettingsInput {
  theme?: UserSettings["theme"]
  language?: string
  timezone?: string
  notifications?: Partial<UserSettings["notifications"]>
  privacy?: Partial<UserSettings["privacy"]>
}
