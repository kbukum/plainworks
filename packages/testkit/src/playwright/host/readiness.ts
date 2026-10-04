import { withTimeout } from "@plainworks/std/resilience"
import type { BrowserGateHost, GateHostRuntime } from "./config"
import { nodeGateHostRuntime } from "./node-runtime"

/** Resolve the same origin for assertions, captures, and startup. */
export function gateHostOrigin(host: BrowserGateHost, port: number): string {
  const origin = host.origin?.(port) ?? `http://127.0.0.1:${port}`
  const url = new URL(origin)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== origin ||
    url.username !== "" ||
    url.password !== "" ||
    Number(url.port || (url.protocol === "https:" ? 443 : 80)) !== port
  ) {
    throw new Error("A gate host requires an HTTP/HTTPS origin on its configured worker port.")
  }
  return origin
}

/** One strict readiness probe, shared by owned startup and warm-host reuse. */
export async function probeGateHost(
  host: BrowserGateHost,
  origin: string,
  options: {
    readonly runtime?: GateHostRuntime
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
  } = {},
): Promise<void> {
  const runtime = options.runtime ?? nodeGateHostRuntime
  await withTimeout(
    async (signal) => {
      const response = await runtime.fetch(`${origin}${host.readyPath}`, {
        redirect: "manual",
        signal,
      })
      try {
        if (
          response.status !== (host.readyStatus ?? 200) ||
          response.status >= 300 ||
          !((await host.ready?.(response)) ?? true)
        ) {
          throw new Error(`Readiness rejected status ${response.status} or response content.`)
        }
      } finally {
        if (!response.bodyUsed) await response.body?.cancel()
      }
    },
    options.timeoutMs ?? host.probeTimeoutMs ?? 1_000,
    options.signal === undefined ? {} : { signal: options.signal },
  )
}
