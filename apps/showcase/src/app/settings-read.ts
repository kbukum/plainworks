// The settings read through its validation boundary, shared by the client query. The mock's decoded
// `unknown` body is narrowed to the typed `UserSettings` by a Standard Schema at the `client.get`
// seam — the same validation path a real consumer uses — so a malformed response fails the read
// instead of being trusted by an unchecked cast. Neutral and server-safe: it names no host global.

import type { UserSettings } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import type { WebAbortSignal } from "@plainworks/std"
import type { QueryFunctionContext } from "@tanstack/react-query"
import { SETTINGS_RESOURCE } from "./constants"
import { settingsEnvelopeSchema } from "./settings-shape"

type HttpClient = ReturnType<typeof createHttpClient>

/** The deterministic cache key one user's settings are read and written under. */
export function settingsQueryKey(userId: string): readonly [string, string] {
  return [SETTINGS_RESOURCE, userId]
}

/** Read one user's settings, validated at the boundary; a bodyless response is a read failure. */
export async function readSettings(
  client: HttpClient,
  userId: string,
  signal?: WebAbortSignal,
): Promise<UserSettings> {
  const body = await client.get("/api/settings", {
    query: { userId },
    ...(signal ? { signal } : {}),
    schema: settingsEnvelopeSchema,
  })
  if (body === undefined) {
    throw new Error("GET /api/settings returned no body")
  }
  return body.data
}

/** A settings query, shaped by user, describing the cache key and a boundary-validated `queryFn`. */
export interface SettingsQueryPlan {
  readonly queryKey: readonly [string, string]
  readonly queryFn: (context: QueryFunctionContext) => Promise<UserSettings>
}

/** The ready-to-spread query plan for one user's settings — the cache key plus the read. */
export function settingsQueryPlan(client: HttpClient, userId: string): SettingsQueryPlan {
  return {
    queryKey: settingsQueryKey(userId),
    queryFn: ({ signal }) => readSettings(client, userId, signal),
  }
}
