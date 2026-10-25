import { join } from "node:path"
import { setupSharedGateHost } from "../../src/playwright/gate"
import { sharedHost } from "./shared-host"

// Starts the run's one host only for the shared-host scenarios; the others start one per worker.
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  if (!(process.env.GATE_SCENARIO ?? "").startsWith("shared")) return undefined
  const data =
    process.env.GATE_DATA_DIR ?? join(import.meta.dirname, "../../node_modules/.cache/gate")
  return setupSharedGateHost(sharedHost(data))
}
