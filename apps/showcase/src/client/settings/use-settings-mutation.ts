"use client"

import type { UpdateSettingsInput, UserSettings } from "@plainworks/demo"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { updateSettings } from "../../app/settings-write"
import { useHttpClient } from "../http-client"

/** Outcome of a settings save, distinguishing teardown cancellation from a real failure. */
export type SettingsMutationResult = "success" | "failure" | "cancelled"

/** The settings save bound to one user's cache key, plus the last failure surfaced typed. */
export interface SettingsMutation {
  /** Persist a partial update; resolves with the outcome and reconciles the cache on success. */
  readonly save: (input: UpdateSettingsInput) => Promise<SettingsMutationResult>
  /** The last save failure, or `undefined` — surfaced as a typed error, never swallowed. */
  readonly error: unknown
}

/**
 * The settings save for `userId` under `queryKey`. It PATCHes the partial update, writes the merged
 * record the server returns straight into the cache (so every panel and the shell read the fresh
 * value), and surfaces a typed failure instead of a silent or success-shaped fallback. The request
 * carries an `AbortSignal` that fires on unmount, so a slow save never settles onto a torn-down
 * form.
 */
export function useSettingsMutation(queryKey: QueryKey, userId: string): SettingsMutation {
  const httpClient = useHttpClient()
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(undefined)
  const [lifecycle] = useState(() => new AbortController())
  const signal = lifecycle.signal

  useEffect(() => () => lifecycle.abort(), [lifecycle])

  const save = useCallback(
    async (input: UpdateSettingsInput): Promise<SettingsMutationResult> => {
      try {
        const updated = await updateSettings(httpClient, userId, input, signal)
        if (signal.aborted) {
          return "cancelled"
        }
        queryClient.setQueryData<UserSettings>(queryKey, updated)
        setError(undefined)
        return "success"
      } catch (cause) {
        if (signal.aborted) {
          return "cancelled"
        }
        setError(cause)
        return "failure"
      }
    },
    [httpClient, queryClient, queryKey, signal, userId],
  )

  return { save, error }
}
