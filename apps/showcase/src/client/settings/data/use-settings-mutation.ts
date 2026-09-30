"use client"

import type { UpdateSettingsInput, UserSettings } from "@plainworks/demo"
import { useHttpClient } from "@plainworks/http/client"
import { type QueryKey, useMutation } from "@tanstack/react-query"
import { useCallback } from "react"
import { updateSettings } from "../../../neutral/settings"

/** The settings save bound to one user's cache key. */
export interface SettingsMutation {
  /**
   * Persist a partial update and reconcile the cache. Resolves `true` on success and `false` on
   * failure, so the caller can report the outcome.
   */
  readonly save: (input: UpdateSettingsInput) => Promise<boolean>
}

/**
 * The settings save for `userId` under `queryKey`. It PATCHes the partial update and writes the
 * merged record the server returns straight into the cache, so every panel and the shell read the
 * fresh value.
 */
export function useSettingsMutation(queryKey: QueryKey, userId: string): SettingsMutation {
  const httpClient = useHttpClient()
  const { mutateAsync } = useMutation({
    mutationFn: (input: UpdateSettingsInput) => updateSettings(httpClient, userId, input),
    onSuccess: (updated, _input, _result, { client }) => {
      client.setQueryData<UserSettings>(queryKey, updated)
    },
  })

  const save = useCallback(
    (input: UpdateSettingsInput): Promise<boolean> =>
      mutateAsync(input).then(
        () => true,
        () => false,
      ),
    [mutateAsync],
  )

  return { save }
}
