"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import type { ReactElement } from "react"
import { useRouter } from "../router"
import { Can, canManageAccount } from "../session"
import { AppearancePanel } from "./appearance-panel"
import { NotificationsPanel } from "./notifications-panel"
import { PreferencesPanel } from "./preferences-panel"
import { ProfilePanel } from "./profile-panel"
import type { SettingsPanelProps } from "./settings-panel"

/** The settings panels, in tab order — the id is also the deep-link segment under `/settings`. */
const PANELS = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Preferences" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
] as const

type PanelId = (typeof PANELS)[number]["id"]

const SETTINGS_PATH = "/settings"

function AccountDenied(): ReactElement {
  return <p className="text-muted-foreground">You cannot manage account settings.</p>
}

/** The active panel from a `/settings/<panel>` path; an unknown or bare path resolves to Profile. */
function panelFromPath(path: string): PanelId {
  const segment = path.startsWith(`${SETTINGS_PATH}/`)
    ? path.slice(SETTINGS_PATH.length + 1).split("/", 1)[0]
    : ""
  return PANELS.find((panel) => panel.id === segment)?.id ?? "profile"
}

/**
 * The tabbed settings surface. Each tab is a deep-linkable panel: the active tab is derived from
 * the router path (`/settings/preferences`) and selecting one navigates there, so a panel is
 * bookmarkable and the browser's back button moves between panels. The Base UI tablist is keyboard-
 * navigable (arrow keys, Home/End).
 */
export function SettingsFrame({ settings, save }: SettingsPanelProps): ReactElement {
  const router = useRouter()
  const active = panelFromPath(router.path)

  return (
    <div>
      <Tabs
        value={active}
        onValueChange={(value) => router.navigate(`${SETTINGS_PATH}/${value}`)}
        className="gap-6"
      >
        <TabsList
          aria-label="Settings sections"
          className="grid h-auto w-full max-w-md grid-cols-2 sm:grid-cols-4 group-data-horizontal/tabs:h-auto"
        >
          {PANELS.map((panel) => (
            <TabsTrigger key={panel.id} value={panel.id}>
              {panel.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile">
          <Can authorizer={canManageAccount} action="account:manage" fallback={<AccountDenied />}>
            <ProfilePanel settings={settings} save={save} />
          </Can>
        </TabsContent>
        <TabsContent value="preferences">
          <Can authorizer={canManageAccount} action="account:manage" fallback={<AccountDenied />}>
            <PreferencesPanel settings={settings} save={save} />
          </Can>
        </TabsContent>
        <TabsContent value="notifications">
          <Can authorizer={canManageAccount} action="account:manage" fallback={<AccountDenied />}>
            <NotificationsPanel settings={settings} save={save} />
          </Can>
        </TabsContent>
        <TabsContent value="appearance">
          <AppearancePanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
