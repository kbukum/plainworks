/**
 * Settings data factories and per-user settings storage
 */

import type { UpdateSettingsInput, UserSettings } from "../types"

export function createUserSettings(userId: string): UserSettings {
  return {
    userId,
    theme: "system",
    language: "en",
    timezone: "America/New_York",
    notifications: {
      email: true,
      push: true,
      sms: false,
    },
    privacy: {
      profileVisible: true,
      showEmail: false,
    },
  }
}

export function updateUserSettings(
  settings: UserSettings,
  updates: UpdateSettingsInput,
): UserSettings {
  return {
    ...settings,
    ...updates,
    notifications: {
      ...settings.notifications,
      ...updates.notifications,
    },
    privacy: {
      ...settings.privacy,
      ...updates.privacy,
    },
  }
}

/** Per-user settings storage. Built per mock server — never a module-level map. */
export interface SettingsStore {
  /** Read a user's settings, creating defaults on first access. */
  get(userId: string): UserSettings
  /** Merge updates into a user's settings and return the result. */
  save(userId: string, updates: UpdateSettingsInput): UserSettings
  /** Delete one user's saved settings (their next read returns defaults). */
  resetUser(userId: string): void
  /** Delete every user's saved settings. */
  reset(): void
}

export function createSettingsStore(): SettingsStore {
  const settingsByUser = new Map<string, UserSettings>()

  const get = (userId: string): UserSettings => {
    const existing = settingsByUser.get(userId)
    if (existing) return existing
    const created = createUserSettings(userId)
    settingsByUser.set(userId, created)
    return created
  }

  return {
    get,

    save(userId: string, updates: UpdateSettingsInput): UserSettings {
      const updated = updateUserSettings(get(userId), updates)
      settingsByUser.set(userId, updated)
      return updated
    },

    resetUser(userId: string): void {
      settingsByUser.delete(userId)
    },

    reset(): void {
      settingsByUser.clear()
    },
  }
}
