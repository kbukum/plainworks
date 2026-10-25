import { join } from "node:path"
import type { BrowserGateHost } from "../../src/playwright/host"

// One host for the whole run; `host.mjs` names its data directory after the port it serves.
export function sharedHost(data: string): BrowserGateHost {
  return {
    command: ({ port }) => [
      process.execPath,
      join(import.meta.dirname, "host.mjs"),
      String(port),
      data,
    ],
    basePort: Number(process.env.GATE_BASE_PORT ?? "7600"),
    readyPath: "/ready",
    startTimeoutMs: 10_000,
    stopTimeoutMs: 2_000,
  }
}
