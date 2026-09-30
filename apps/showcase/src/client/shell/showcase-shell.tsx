"use client"

import { useTheme } from "@plainworks/theme/client"
import { Callout } from "@plainworks/ui/feedback/callout"
import { Page } from "@plainworks/ui/layout/page"
import { PageHeader } from "@plainworks/ui/layout/page-header"
import { Breadcrumbs } from "@plainworks/ui/navigation/breadcrumbs"
import { AppShell } from "@plainworks/ui/shell/app-shell"
import { ThemeModeMenu } from "@plainworks/ui/theme/theme-mode-menu"
import { defaultThemeStudioLabels } from "@plainworks/ui/theme/theme-studio"
import { Menu } from "lucide-react"
import type { ReactElement } from "react"
import { breadcrumbTrail, sectionForPath } from "../../neutral/navigation"
import { CommandMenu } from "../command"
import { NotificationsBell } from "../notifications/notifications-bell"
import { routerLinkRender, useRouter } from "../router"
import { THEME_MODE_ICONS } from "../theme-mode-icons"
import { AccountMenu } from "./account-menu"
import { SectionNav } from "./section-nav"
import { SectionOutlet } from "./section-outlet"

/**
 * The showcase frame: the kit's `AppShell` with the section navigation, one row of header actions
 * (search, notifications, color mode, account), and a page header for the active section. The
 * active section comes from the router path, so navigation, breadcrumbs, and title always agree.
 * A theme persistence failure is announced once, here, for the whole app.
 */
export function ShowcaseShell(): ReactElement {
  const { path, navigate } = useRouter()
  const { error } = useTheme()
  const active = sectionForPath(path)
  const linkRender = routerLinkRender(navigate)
  const trail = breadcrumbTrail(active)

  return (
    <AppShell
      brand="plainworks"
      mainLabel={active.label}
      navigationKey={active.id}
      menuIcon={<Menu aria-hidden className="size-5" />}
      labels={{ openNavigation: "Open sections menu", navigation: "Sections" }}
      navigation={({ placement, onNavigate }) =>
        placement === "rail" ? (
          <SectionNav label="Primary" />
        ) : (
          <SectionNav label="Sections" onNavigate={onNavigate} />
        )
      }
      actions={
        <>
          <CommandMenu />
          <NotificationsBell />
          <ThemeModeMenu icons={THEME_MODE_ICONS} />
          <AccountMenu />
        </>
      }
    >
      <Page width="full">
        <PageHeader
          title={active.label}
          description={active.summary}
          {...(trail.length > 1
            ? {
                navigation: (
                  <Breadcrumbs
                    items={trail.map((crumb) =>
                      crumb.path === undefined
                        ? { label: crumb.label }
                        : { label: crumb.label, href: crumb.path, render: linkRender },
                    )}
                  />
                ),
              }
            : {})}
        />
        {error === undefined ? null : (
          <Callout tone="danger">{defaultThemeStudioLabels.error}</Callout>
        )}
        <SectionOutlet section={active} />
      </Page>
    </AppShell>
  )
}
