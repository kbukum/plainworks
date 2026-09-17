// The gated Account route (RSC). The session gate is the real boundary; the panel content is then
// gated a second time by the same authorization decision as its affordance, proving the client
// `Can` gate and the server session gate compose.

import type { ReactElement } from "react"
import { AccountPanel } from "../../client/account-panel"
import { ACCOUNT_PATH } from "../../neutral/constants"
import { requireSession } from "../../server/session"

export const dynamic = "force-dynamic"

export default async function AccountPage(): Promise<ReactElement> {
  await requireSession(ACCOUNT_PATH)
  return (
    <>
      <h1>Account settings</h1>
      <AccountPanel />
    </>
  )
}
