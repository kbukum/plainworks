/**
 * Settings API handlers
 */

import { isRecord } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import type { SettingsStore } from "../data/settings"
import type { UpdateSettingsInput, UserSettings } from "../types"
import type { LatencyController } from "../utils/delay"

const THEMES: readonly UserSettings["theme"][] = ["light", "dark", "system"]

/** Decode an untrusted PATCH body into {@link UpdateSettingsInput}; `null` rejects with 400. */
function decodeSettingsUpdate(body: unknown): UpdateSettingsInput | null {
  if (!isRecord(body)) return null
  const out: UpdateSettingsInput = {}

  if (body.theme !== undefined) {
    if (typeof body.theme !== "string" || !THEMES.includes(body.theme as UserSettings["theme"])) {
      return null
    }
    out.theme = body.theme as UserSettings["theme"]
  }
  if (body.language !== undefined) {
    if (typeof body.language !== "string") return null
    out.language = body.language
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string") return null
    out.timezone = body.timezone
  }
  if (body.notifications !== undefined) {
    if (!isRecord(body.notifications)) return null
    const notifications: UpdateSettingsInput["notifications"] = {}
    for (const key of ["email", "push", "sms"] as const) {
      const value = body.notifications[key]
      if (value !== undefined) {
        if (typeof value !== "boolean") return null
        notifications[key] = value
      }
    }
    out.notifications = notifications
  }
  if (body.privacy !== undefined) {
    if (!isRecord(body.privacy)) return null
    const privacy: UpdateSettingsInput["privacy"] = {}
    for (const key of ["profileVisible", "showEmail"] as const) {
      const value = body.privacy[key]
      if (value !== undefined) {
        if (typeof value !== "boolean") return null
        privacy[key] = value
      }
    }
    out.privacy = privacy
  }

  return out
}

export function createSettingsHandlers(
  settings: SettingsStore,
  latency: LatencyController,
): HttpHandler[] {
  return [
    // GET /api/settings
    http.get("*/api/settings", async ({ request }) => {
      await latency.wait(request.signal)
      const url = new URL(request.url)
      const userId = url.searchParams.get("userId") || "default-user"

      return HttpResponse.json({ data: settings.get(userId) })
    }),

    // PATCH /api/settings
    http.patch("*/api/settings", async ({ request }) => {
      await latency.wait(request.signal)
      const url = new URL(request.url)
      const userId = url.searchParams.get("userId") || "default-user"

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

      return HttpResponse.json({ data: settings.save(userId, updates) })
    }),

    // POST /api/settings/reset — resets only the addressed user's settings
    http.post("*/api/settings/reset", async ({ request }) => {
      await latency.wait(request.signal)
      const url = new URL(request.url)
      const userId = url.searchParams.get("userId") || "default-user"

      settings.resetUser(userId)
      return HttpResponse.json({ data: settings.get(userId) })
    }),
  ]
}
