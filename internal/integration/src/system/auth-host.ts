import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import type { BrowserGateHost } from "@plainworks/testkit/playwright"
import type { APIRequestContext } from "@playwright/test"
import { privateFile } from "./paths"

/** The pinned, immutable gokit auth host revision this proof builds and runs. */
export const AUTH_HOST_REVISION = "2225747c5bacffa1c60b4ba48c64346e39a1a4a1"
export const AUTH_RUN_ID = "auth-worker"
export const AUTH_PROTOCOL = "gokit.session.v1"
export const AUTH_USERNAME = "fixture-user"

/** The container path the Dockerfile installs the built host to; overridable for local inspection. */
export const authBinary = (): string => process.env.AUTH_HOST_BIN ?? "/usr/local/bin/auth-host"

const fixturePath = (): string => privateFile("auth-fixture.json")
const statePath = (): string => privateFile("auth-sessions.db")
const assetsDir = (): string => privateFile("assets")

/** Private synthetic credentials from `-init-fixture`; never a retained artifact. */
export interface AuthFixture {
  readonly username: string
  readonly password: string
  readonly controlToken: string
  readonly apiKey: string
}

/** Create the private fixture once; it is never overwritten. */
export function initAuthFixture(): void {
  if (existsSync(fixturePath())) {
    authFixture()
    return
  }
  execFileSync(authBinary(), ["-init-fixture", fixturePath()], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 30_000,
  })
}

export function authFixture(): AuthFixture {
  const raw: unknown = JSON.parse(readFileSync(fixturePath(), "utf8"))
  if (typeof raw !== "object" || raw === null) throw new Error("auth fixture is unreadable")
  const record = raw as Record<string, unknown>
  const password = record.password
  const controlToken = record.controlToken
  const apiKey = record.apiKey
  if (
    typeof password !== "string" ||
    typeof controlToken !== "string" ||
    typeof apiKey !== "string"
  )
    throw new Error("auth fixture is incomplete")
  return { username: AUTH_USERNAME, password, controlToken, apiKey }
}

/** One owned real gokit auth HTTPS host per worker, serving the built browser consumer. */
export function authHost(): BrowserGateHost {
  return {
    command: (target) => [
      authBinary(),
      "-origin",
      target.origin,
      "-cert",
      privateFile("localhost.pem"),
      "-key",
      privateFile("localhost-key.pem"),
      "-fixture",
      fixturePath(),
      "-state",
      statePath(),
      "-run-id",
      AUTH_RUN_ID,
      "-build-id",
      AUTH_HOST_REVISION,
      "-assets",
      assetsDir(),
    ],
    basePort: 7440,
    origin: (port) => `https://localhost:${port}`,
    readyPath: "/_test/ready",
    readyStatus: 200,
    ready: async (response) => {
      const value: unknown = await response.json()
      if (typeof value !== "object" || value === null) return false
      const record = value as Record<string, unknown>
      return (
        record.protocol === AUTH_PROTOCOL &&
        record.runId === AUTH_RUN_ID &&
        record.buildId === AUTH_HOST_REVISION &&
        record.schemaVersion === 1
      )
    },
    startTimeoutMs: 30_000,
    probeTimeoutMs: 1_000,
    stopTimeoutMs: 10_000,
  }
}

const controlHeaders = (): Record<string, string> => ({
  "X-Test-Control": authFixture().controlToken,
})

/** Reset before sign-in: truncate fixture data and restore the domain clock. */
export async function resetAuthHost(request: APIRequestContext): Promise<void> {
  const response = await request.post("/_test/reset", {
    headers: controlHeaders(),
    timeout: 1_000,
  })
  if (!response.ok()) throw new Error(`auth host reset failed: ${response.status()}`)
}

/** Drive a named backend scenario (expired, unavailable-store, hold-status, …). */
export async function authScenario(request: APIRequestContext, name: string): Promise<void> {
  const response = await request.post("/_test/scenario", {
    headers: controlHeaders(),
    data: { name },
    timeout: 1_000,
  })
  if (!response.ok()) throw new Error(`auth scenario ${name} failed: ${response.status()}`)
}

/** Non-secret held-status observation for the late-status race. */
export async function statusPending(request: APIRequestContext): Promise<boolean> {
  const response = await request.get("/_test/state", {
    headers: controlHeaders(),
    timeout: 1_000,
  })
  if (!response.ok()) throw new Error(`auth state read failed: ${response.status()}`)
  const value = (await response.json()) as { statusPending?: boolean }
  return value.statusPending === true
}
