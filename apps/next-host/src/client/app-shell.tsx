"use client"

import { login, logout } from "@plainworks/auth/client"
import type { StateSource } from "@plainworks/std"
import { Breadcrumbs, type BreadcrumbsProps } from "@plainworks/ui/client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react"
import { ACCOUNT_PATH, OVERVIEW_PATH, TASKS_PATH } from "../neutral/constants"
import { type LiveTasks, useLiveTasks } from "./live-stream"
import { nextLinkRender } from "./next-link"
import { Can, canManageAccount, useIdentity, useIsAuthenticated } from "./session"

/** Props for {@link AppShell}. */
export interface AppShellProps {
  /** The live-tasks slot the activity feed renders. */
  readonly liveSource: StateSource<LiveTasks>
  /** The active route's page content. */
  readonly children: ReactNode
}

/** The account bar — identity, the authorization-gated account link, and sign-in/out. */
function AccountBar(): ReactElement {
  const identity = useIdentity()
  const authenticated = useIsAuthenticated()
  const name =
    (typeof identity?.claims.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Guest"

  if (!authenticated) {
    return (
      <div>
        <span>Not signed in</span>{" "}
        <button type="button" onClick={() => login({ returnTo: TASKS_PATH })}>
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div>
      <span>
        Signed in as <strong>{name}</strong>
      </span>{" "}
      <Can authorizer={canManageAccount} action="account:manage">
        <Link href={ACCOUNT_PATH}>Account settings</Link>
      </Can>{" "}
      <button type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  )
}

/**
 * The live-activity feed folded from the unified stream. The stream rewrites the feed while the
 * page sits still, so the list lives in a permanently mounted polite live region — assistive
 * technology hears each update without the feed stealing focus from whatever the reader is doing.
 */
function LiveActivity({ source }: { readonly source: StateSource<LiveTasks> }): ReactElement {
  const { tasks, error } = useLiveTasks(source)
  const entries = Object.entries(tasks)
  return (
    <section aria-labelledby="live-heading">
      <h2 id="live-heading">Live activity</h2>
      <div aria-live="polite">
        {error !== undefined ? (
          <p>Could not load live activity.</p>
        ) : entries.length === 0 ? (
          <p>Waiting for the first streamed update…</p>
        ) : (
          <ul>
            {entries.map(([id, title]) => (
              <li key={id}>{title}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Build the breadcrumb trail for the active route, its links backed by the host's App Router. */
function crumbsFor(
  pathname: string,
  linkRender: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactElement,
): BreadcrumbsProps["items"] {
  if (pathname === TASKS_PATH) {
    return [{ label: "Home", href: OVERVIEW_PATH, render: linkRender }, { label: "Tasks" }]
  }
  if (pathname === ACCOUNT_PATH) {
    return [
      { label: "Home", href: OVERVIEW_PATH, render: linkRender },
      { label: "Account settings" },
    ]
  }
  return [{ label: "Home" }]
}

/**
 * The app chrome the RSC layout wraps every route in: the account bar, host-router-aware
 * breadcrumbs, the section nav, and the live-activity feed. Navigation runs through the host's own
 * App Router — `next/link` for the section nav, `router.push` behind the breadcrumb `render` seam —
 * proving the `ui` breadcrumb seam and the section nav bind to a genuinely different router than
 * the showcase's history router.
 */
export function AppShell({ liveSource, children }: AppShellProps): ReactElement {
  const pathname = usePathname()
  const router = useRouter()
  const linkRender = nextLinkRender((to) => router.push(to))
  return (
    <main>
      <AccountBar />
      <Breadcrumbs items={crumbsFor(pathname, linkRender)} />
      <nav aria-label="Sections">
        <Link href={OVERVIEW_PATH} aria-current={pathname === OVERVIEW_PATH ? "page" : undefined}>
          Overview
        </Link>{" "}
        <Link href={TASKS_PATH} aria-current={pathname === TASKS_PATH ? "page" : undefined}>
          Tasks
        </Link>
      </nav>

      {children}

      <LiveActivity source={liveSource} />
    </main>
  )
}
