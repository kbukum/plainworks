// The RSC root layout — the neutral render seam under Next. It resolves the per-request snapshot
// (theme + session) through the `@plainworks/app` recipes, writes the persisted theme class onto
// `<html>`, and mounts the client `Providers`. React serializes the snapshot across the RSC
// boundary, so this host needs no hydration script of its own. A `system` preference gets no mode
// class, so the stylesheet follows the OS preference on the first paint. Token custody stays
// server-side: only the identity slice of the snapshot crosses to the client, never a token.

import type { ReactElement, ReactNode } from "react"
import { Providers } from "../client/providers"
import { requestOrigin, resolveDocument } from "../server/session"
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
  const { snapshot, htmlClass } = await resolveDocument()
  const origin = requestOrigin()
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
