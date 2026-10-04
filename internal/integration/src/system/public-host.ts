import { fileURLToPath } from "node:url"
import type { BrowserGateHost } from "@plainworks/testkit/playwright"
import { privateFile } from "./paths"

export function publicHost(untrusted = false): BrowserGateHost {
  return {
    command: [
      process.execPath,
      fileURLToPath(new URL("../host/http-host.fixture.mjs", import.meta.url)),
    ],
    basePort: untrusted ? 7390 : 7300,
    origin: (port) => `https://127.0.0.1:${port}`,
    readyPath: "/ready",
    ready: async (response) => {
      const value: unknown = await response.json()
      return (
        typeof value === "object" &&
        value !== null &&
        "protocol" in value &&
        value.protocol === "plainworks.host.v1"
      )
    },
    env: () => ({
      HOST_CERT: privateFile(untrusted ? "untrusted.pem" : "localhost.pem"),
      HOST_KEY: privateFile(untrusted ? "untrusted-key.pem" : "localhost-key.pem"),
    }),
    startTimeoutMs: untrusted ? 1_500 : 5_000,
    probeTimeoutMs: 200,
    stopTimeoutMs: 1_000,
  }
}
