/**
 * Settings API handlers
 */

import type { LatencyController } from "@plainworks/mocks"
import { isRecord } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import type { SettingsStore } from "../data/settings"
import type {
  SettingsNotifications,
  SettingsPrivacy,
  SettingsRequestAuthorizer,
  UpdateSettingsInput,
} from "../types"
import { decodeSettingsPreferencesUpdate, decodeSettingsProfileUpdate } from "../types"

// Decode one group's boolean fields, rejecting the whole update on the first non-boolean value.
function decodeBooleanFields<K extends string>(
  group: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, boolean>> | null {
  const out: Partial<Record<K, boolean>> = {}
  for (const key of keys) {
    const value = group[key]
    if (value === undefined) continue
    if (typeof value !== "boolean") return null
    out[key] = value
  }
  return out
}

/** Decode an untrusted PATCH body into {@link UpdateSettingsInput}; `null` rejects with 400. */
function decodeSettingsUpdate(body: unknown): UpdateSettingsInput | null {
  if (!isRecord(body)) return null
  const out: UpdateSettingsInput = {}

  if (body.profile !== undefined) {
    const profile = decodeSettingsProfileUpdate(body.profile)
    if ("issues" in profile) return null
    out.profile = profile.value
  }

  if (body.preferences !== undefined) {
    const preferences = decodeSettingsPreferencesUpdate(body.preferences)
    if ("issues" in preferences) return null
    out.preferences = preferences.value
  }

  if (body.notifications !== undefined) {
    if (!isRecord(body.notifications)) return null
    const notifications = decodeBooleanFields<keyof SettingsNotifications & string>(
      body.notifications,
      ["email", "push", "sms"],
    )
    if (notifications === null) return null
    out.notifications = notifications
  }

  if (body.privacy !== undefined) {
    if (!isRecord(body.privacy)) return null
    const privacy = decodeBooleanFields<keyof SettingsPrivacy & string>(body.privacy, [
      "profileVisible",
      "showEmail",
    ])
    if (privacy === null) return null
    out.privacy = privacy
  }

  return out
}

function userIdOf(request: Request): string {
  return new URL(request.url).searchParams.get("userId") || "default-user"
}

export function createSettingsHandlers(
  settings: SettingsStore,
  latency: LatencyController,
  authorizeMutation?: SettingsRequestAuthorizer,
  authorizeRead?: SettingsRequestAuthorizer,
): HttpHandler[] {
  // A denied request is answered with `403` before the store is touched, so a client gate stays a
  // UX affordance and the server boundary is the real one.
  const deny = (): Response =>
    HttpResponse.json({ data: null, error: "Not authorized" }, { status: 403 })

  return [
    // GET /api/settings
    http.get("*/api/settings", async ({ request }) => {
      await latency.wait(request.signal)
      if (authorizeRead && !(await authorizeRead(request))) return deny()
      return HttpResponse.json({ data: settings.get(userIdOf(request)) })
    }),

    // PATCH /api/settings
    http.patch("*/api/settings", async ({ request }) => {
      await latency.wait(request.signal)
      if (authorizeMutation && !(await authorizeMutation(request))) return deny()

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return HttpResponse.json({ data: null, error: "invalid JSON body" }, { status: 400 })
      }
      const updates = decodeSettingsUpdate(body)
      if (updates === null) {
        return HttpResponse.json({ data: null, error: "invalid settings update" }, { status: 400 })
      }

      return HttpResponse.json({ data: settings.save(userIdOf(request), updates) })
    }),

    // POST /api/settings/reset — resets only the addressed user's settings
    http.post("*/api/settings/reset", async ({ request }) => {
      await latency.wait(request.signal)
      if (authorizeMutation && !(await authorizeMutation(request))) return deny()

      const userId = userIdOf(request)
      settings.resetUser(userId)
      return HttpResponse.json({ data: settings.get(userId) })
    }),
  ]
}
