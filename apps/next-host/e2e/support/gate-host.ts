import { setupSharedGateHost } from "@plainworks/testkit/playwright"
import { NEXT_HOST_SERVER } from "./server"

// Playwright's `globalSetup`: start the one `next dev` every worker shares. A run pointed at an
// already running host (`ui:capture`) starts nothing.
export default (): Promise<() => Promise<void>> => setupSharedGateHost(NEXT_HOST_SERVER)
