"use client"

import { buttonVariants } from "@plainworks/elements/button"
import { asyncStatus } from "@plainworks/ui"
import { AsyncState, EmptyState, ErrorState, LoadingState } from "@plainworks/ui/feedback"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { settingsQueryPlan } from "../../app/settings-read"
import { useHttpClient } from "../http-client"
import { RequireAuth, useIdentity } from "../session"
import { SettingsFrame } from "./settings-frame"
import { useSettingsMutation } from "./use-settings-mutation"

/** The sign-in prompt a guest sees in place of the settings — there is no account to manage yet. */
function GuestPrompt(): ReactElement {
  return (
    <EmptyState
      title="Sign in to manage your settings"
      description="Your profile, preferences, and notifications live with your account."
      action={
        <a href="/login?returnTo=%2Fsettings" className={buttonVariants({ variant: "default" })}>
          Sign in
        </a>
      }
    />
  )
}

/** Read and edit the signed-in user's settings — the panels, gated behind a resolved read. */
function AccountSettings({ userId }: { readonly userId: string }): ReactElement {
  const httpClient = useHttpClient()
  const plan = settingsQueryPlan(httpClient, userId)
  const query = useQuery(plan)
  const mutation = useSettingsMutation(plan.queryKey, userId)

  return (
    <AsyncState
      status={asyncStatus({ pending: query.isPending, error: query.isError })}
      loading={<LoadingState label="Loading settings" lines={6} />}
      error={
        <ErrorState
          title="Settings are unavailable"
          description="Your settings could not be loaded."
          onRetry={() => void query.refetch()}
        />
      }
    >
      {query.data === undefined ? null : (
        <SettingsFrame settings={query.data} save={mutation.save} />
      )}
    </AsyncState>
  )
}

/** Bridge the authenticated identity to its settings; the null case is a defensive guest fallback. */
function IdentitySettings(): ReactElement {
  const identity = useIdentity()
  return identity === null ? <GuestPrompt /> : <AccountSettings userId={identity.subject} />
}

/**
 * The Settings hub: a tabbed, deep-linkable surface for the signed-in user's account. It reads the
 * settings for the session identity, then lets them edit their profile, preferences, and
 * notifications (each a schema-validated save with a success/failure toast) and their appearance
 * (theme and a device-local motion preference). A guest is shown a sign-in prompt — there is no
 * account to manage — matching the server boundary that rejects an unauthenticated write.
 */
export function SettingsSection(): ReactElement {
  return (
    <RequireAuth fallback={<GuestPrompt />}>
      <IdentitySettings />
    </RequireAuth>
  )
}
