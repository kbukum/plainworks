import "server-only"

import { join, resolve } from "node:path"
import { createMockIdp, type MockIdp } from "@plainworks/mocks/idp"
import { AUTH_CALLBACK_PATH } from "../neutral/constants"
import { createNextAuth, type NextAuth, nextSessionSchema } from "./auth"
import {
  createSqliteMockIdpState,
  createSqliteRefreshTokenStore,
  createSqliteSessionStore,
  deriveKey,
  resolveRootKey,
} from "./custody"
import { appOrigin } from "./origin"

/** The assembled host session flow plus the mock provider that stands in for the interactive login. */
export interface HostAuth {
  /** The `@plainworks/auth` session composition driving `/login`, `/auth/callback`, `/logout`. */
  readonly auth: NextAuth
  /** The in-process provider — its `authorize` bounces straight to the callback (no login page). */
  readonly idp: MockIdp
}

export interface HostAuthOptions {
  readonly directory: string
  readonly origin: string
  readonly configuredKey?: string | undefined
  readonly allowCreate: boolean
  readonly demo: boolean
}

function hostOptions(): HostAuthOptions {
  const development = process.env.NODE_ENV !== "production"
  return {
    directory: resolve(process.env.PLAINWORKS_DATA_DIR ?? ".private/auth"),
    origin: appOrigin(),
    configuredKey: process.env.SESSION_ROOT_KEY,
    allowCreate: development,
    demo: development || process.env.PLAINWORKS_DEMO_AUTH === "1",
  }
}

/** Own request-local resources; only encrypted data survives requests or normal server restart. */
export async function withHostAuth<Value>(
  operation: (host: HostAuth) => Value | Promise<Value>,
  options: HostAuthOptions = hostOptions(),
): Promise<Value> {
  if (!options.demo) throw new Error("bundled sign-in requires explicit demo mode")
  const root = resolveRootKey({
    filename: join(options.directory, "root.key"),
    configured: options.configuredKey,
    allowCreate: options.allowCreate,
  })
  const keys: Uint8Array[] = [root]
  const resources: { close(): void }[] = []
  let outcome: { ok: true; value: Value } | { ok: false; failure: unknown }
  try {
    const key = (purpose: string): Uint8Array => {
      const value = deriveKey(root, purpose)
      keys.push(value)
      return value
    }
    const store = createSqliteSessionStore({
      filename: join(options.directory, "sessions.sqlite"),
      encryptionKey: key("sessions"),
      schema: nextSessionSchema,
    })
    resources.push(store)
    const tokenStore = createSqliteRefreshTokenStore({
      filename: join(options.directory, "refresh.sqlite"),
      encryptionKey: key("refresh"),
      maxEntries: 1024,
    })
    resources.push(tokenStore)
    const state = createSqliteMockIdpState({
      filename: join(options.directory, "fixture.sqlite"),
      encryptionKey: key("fixture"),
    })
    resources.push(state)
    const idp = await createMockIdp({ state, claims: { name: "Ada Lovelace" }, alg: "ES256" })
    resources.push(idp)
    const auth = createNextAuth({
      store,
      tokenStore,
      fetch: idp.fetch,
      issuer: idp.issuer,
      clientId: idp.clientId,
      redirectUri: `${options.origin}${AUTH_CALLBACK_PATH}`,
      signingKey: key("transactions"),
    })
    outcome = { ok: true, value: await operation({ auth, idp }) }
  } catch (cause) {
    outcome = { ok: false, failure: cause }
  }
  const errors: unknown[] = []
  for (const resource of resources.reverse()) {
    try {
      resource.close()
    } catch (cause) {
      errors.push(cause)
    }
  }
  for (const key of keys) key.fill(0)
  if (errors.length > 0) {
    throw new AggregateError(
      outcome.ok ? errors : [outcome.failure, ...errors],
      "host authentication cleanup failed",
    )
  }
  if (!outcome.ok) throw outcome.failure
  return outcome.value
}
