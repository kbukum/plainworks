"use client"

import type { StateSource } from "@plainworks/std/seam"
import { useTheme } from "@plainworks/theme/client"
import { Callout } from "@plainworks/ui/feedback"
import { Breadcrumbs, NavList } from "@plainworks/ui/navigation"
import { Page, PageHeader } from "@plainworks/ui/page"
import { AppShell } from "@plainworks/ui/shell"
import { defaultThemeModeLabels, ThemeModeMenu } from "@plainworks/ui/theme"
import { LayoutGrid, ListChecks, Menu } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import type { ReactElement, ReactNode } from "react"
import { OVERVIEW_PATH } from "../neutral/constants"
import { HOST_NAVIGATION, type HostRoute, hostRouteFor } from "../neutral/routes"
import { AccountMenu } from "./account-menu"
import { LiveActivity } from "./live-activity"
import type { LiveTasks } from "./live-stream"
import { THEME_MODE_ICONS } from "./mode-icons"
import { nextLinkRender } from "./next-link"

const NAV_ICONS: Record<HostRoute["id"], ReactNode> = {
  overview: <LayoutGrid aria-hidden />,
  tasks: <ListChecks aria-hidden />,
  account: null,
  "sign-in-interrupted": null,
}

/** Props for {@link HostShell}. */
export interface HostShellProps {
  /** The live-tasks slot the activity feed renders. */
  readonly liveSource: StateSource<LiveTasks>
  /** The active route's page content. */
  readonly children: ReactNode
}

/**
 * The app frame the RSC layout wraps every route in, built on the kit's `AppShell`. The header
 * holds the color mode and account controls; the section nav sits in a rail or a drawer; each page
 * gets a title, a summary, and (below the top level) a breadcrumb trail, followed by the
 * live-activity feed. Every link is a real anchor whose plain click routes through the App Router's
 * `router.push`, the same link seam the showcase backs with its history router. The header menu has
 * no room for an inline error, so a color mode that cannot be saved is announced once, here.
 */
export function HostShell({ liveSource, children }: HostShellProps): ReactElement {
  const pathname = usePathname()
  const router = useRouter()
  const { error: themeError } = useTheme()
  const linkRender = nextLinkRender((to) => router.push(to))
  const route = hostRouteFor(pathname)
  const items = HOST_NAVIGATION.map((entry) => ({
    id: entry.id,
    label: entry.label,
    href: entry.path,
    icon: NAV_ICONS[entry.id],
    current: entry.id === route?.id,
  }))

  return (
    <AppShell
      brand={linkRender({
        href: OVERVIEW_PATH,
        className: "font-semibold",
        children: "plainworks",
      })}
      actions={
        <>
          <ThemeModeMenu icons={THEME_MODE_ICONS} />
          <AccountMenu />
        </>
      }
      navigation={({ placement, onNavigate }) => (
        <NavList
          label={placement === "rail" ? "Primary" : "Sections"}
          items={items}
          renderLink={linkRender}
          onNavigate={onNavigate}
        />
      )}
      mainLabel={route?.label ?? "Page"}
      navigationKey={pathname}
      menuIcon={<Menu aria-hidden />}
      labels={{ openNavigation: "Open sections menu", navigation: "Sections" }}
    >
      <Page width="full">
        {route === undefined ? null : (
          <PageHeader
            title={route.label}
            description={route.summary}
            {...(route.path === OVERVIEW_PATH
              ? {}
              : {
                  navigation: (
                    <Breadcrumbs
                      items={[
                        { label: "Overview", href: OVERVIEW_PATH, render: linkRender },
                        { label: route.label },
                      ]}
                    />
                  ),
                })}
          />
        )}
        {themeError === undefined ? null : (
          <Callout tone="danger">{defaultThemeModeLabels.error}</Callout>
        )}
        {children}
        <LiveActivity source={liveSource} />
      </Page>
    </AppShell>
  )
}
