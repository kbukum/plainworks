"use client"

import { buttonVariants } from "@plainworks/elements/button"
import { Section } from "@plainworks/ui/page"
import Link from "next/link"
import type { ReactElement } from "react"
import { TASKS_PATH } from "../neutral/constants"

const PROOFS = [
  "The page renders on the server and hydrates without a flash or a refetch.",
  "Sign-in keeps every token on the server; the browser only sees who you are.",
  "Live task updates stream in while the page sits still.",
  "Links run through the Next.js router behind the same seam the showcase uses.",
] as const

/** The overview body: what this host proves, and the way into the gated tasks view. */
export function HostOverview(): ReactElement {
  return (
    <Section
      title="One kit, two hosts"
      description="This app uses the same published packages as the Vite showcase, unchanged."
      actions={
        <Link href={TASKS_PATH} className={buttonVariants({ size: "sm" })}>
          Open tasks
        </Link>
      }
    >
      <ul className="grid list-disc gap-2 ps-5 text-sm">
        {PROOFS.map((proof) => (
          <li key={proof}>{proof}</li>
        ))}
      </ul>
    </Section>
  )
}
