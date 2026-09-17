import Link from "next/link"
import type { ReactElement } from "react"
import { TASKS_PATH } from "../neutral/constants"

/**
 * The public overview — the landing route, reachable without a session. It introduces the host and
 * links into the gated Tasks view, which redirects to login when there is no session.
 */
export default function OverviewPage(): ReactElement {
  return (
    <>
      <h1>Overview</h1>
      <p>
        A Next.js App Router host assembled from the plainworks kit — the same composition kernel,
        theme, query, channel, state, ui, and auth surfaces the Vite showcase uses, over the same
        mock backend. Open the <Link href={TASKS_PATH}>Tasks</Link> view (it requires signing in) to
        see the query-driven list and the live stream.
      </p>
    </>
  )
}
