"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { useQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { settingsQueryPlan } from "../../app/settings-read"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
import { RequireAuth, useIdentity } from "../session"
import { SettingsFrame } from "./settings-frame"
import { useSettingsMutation } from "./use-settings-mutation"

/** The sign-in prompt a guest sees in place of the settings — there is no account to manage yet. */
function GuestPrompt(): ReactElement {
  return (
    <Card className="border-border/70">
      <CardContent className="px-4 py-8 text-center sm:px-6">
        <p className="text-muted-foreground">Sign in to manage your account settings.</p>
      </CardContent>
    </Card>
  )
}

/** Read and edit the signed-in user's settings — the panels, gated behind a resolved read. */
function AccountSettings({ userId }: { readonly userId: string }): ReactElement {
  const httpClient = useHttpClient()
  const plan = settingsQueryPlan(httpClient, userId)
  const query = useQuery(plan)
  const mutation = useSettingsMutation(plan.queryKey, userId)

  return (
    <Card className="min-w-0 border-border/70">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
        <SectionState
          pending={query.isPending}
          error={query.isError}
          loadingLabel="Loading settings"
          errorTitle="Settings are unavailable"
          errorBody="Your settings could not be loaded. Try again shortly."
        >
          {query.data === undefined ? null : (
            <SettingsFrame settings={query.data} save={mutation.save} />
          )}
        </SectionState>
      </CardContent>
    </Card>
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
    <section aria-label="Settings" className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Manage your profile, preferences, notifications, and appearance. Account changes are saved
        to the server; appearance is saved to this device.
      </p>
      <RequireAuth fallback={<GuestPrompt />}>
        <IdentitySettings />
      </RequireAuth>
    </section>
  )
}
