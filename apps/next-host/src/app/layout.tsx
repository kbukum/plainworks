// The RSC root layout — the neutral render seam under Next. It resolves the per-request snapshot
// (theme + session) through the composition kernel, writes the persisted theme class onto `<html>`,
// and mounts the client `Providers` that assemble the published surfaces. A `system` preference is
// intentionally light-first until the client can read the OS preference. Token custody stays
// server-side: only the identity slice of the snapshot crosses to the client, never a token.

import { snapshotFor } from "@plainworks/app"
import type { ReactElement, ReactNode } from "react"
import { Providers } from "../client/providers"
import { THEME_CAPABILITY_ID } from "../neutral/constants"
import { resolveHtmlClass } from "../neutral/theme"
import { requestOrigin, resolveSnapshot } from "../server/session"
import "./globals.css"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "plainworks reference dashboard (Next.js)",
  description: "A Next.js App Router host assembling the published @plainworks/* surfaces.",
}

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode
}): Promise<ReactElement> {
  const snapshot = await resolveSnapshot()
  const origin = requestOrigin()
  const htmlClass = resolveHtmlClass(snapshotFor(snapshot, THEME_CAPABILITY_ID))
  return (
    <html lang="en" className={htmlClass}>
      <body>
        <Providers snapshot={snapshot} origin={origin}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
