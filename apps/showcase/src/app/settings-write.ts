// The settings write through its validation boundary: PATCH one or more setting groups and read the
// persisted record back. The response is decoded from `unknown` and narrowed by the same
// {@link isUserSettings} guard the read uses, so the cache reconciles against a trusted shape, not
// a fabricated one. Neutral and server-safe: it names no host global and the write is cancellable.

import type { UpdateSettingsInput, UserSettings } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import type { WebAbortSignal } from "@plainworks/std"
import { SETTINGS_MUTATION_HEADER, SETTINGS_MUTATION_HEADER_VALUE } from "./constants"
import { settingsEnvelopeSchema } from "./settings-shape"

type HttpClient = ReturnType<typeof createHttpClient>

/**
 * Persist a partial settings update for one user, returning the merged record validated at the
 * boundary; a bodyless response fails. Carries the non-simple mutation header so a cross-origin
 * form POST cannot ride the session cookie into the endpoint.
 */
export async function updateSettings(
  client: HttpClient,
  userId: string,
  input: UpdateSettingsInput,
  signal?: WebAbortSignal,
): Promise<UserSettings> {
  const updated = await client.patch("/api/settings", {
    query: { userId },
    body: input,
    headers: { [SETTINGS_MUTATION_HEADER]: SETTINGS_MUTATION_HEADER_VALUE },
    ...(signal ? { signal } : {}),
    schema: settingsEnvelopeSchema,
  })
  if (updated === undefined) {
    throw new Error("PATCH /api/settings returned no body")
  }
  return updated.data
}
