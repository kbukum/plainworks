import type { ReactElement } from "react"
import { HostOverview } from "../client/overview"

/**
 * The public overview: the landing route, reachable without a session. The app frame supplies the
 * page title; the body links into the gated Tasks view, which redirects to sign-in without a
 * session.
 */
export default function OverviewPage(): ReactElement {
  return <HostOverview />
}
