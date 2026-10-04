import {
  createMemorySessionStore,
  createRequestJar,
  type OpaqueSessionStore,
} from "@plainworks/auth/server"
import { createMockApi, type MockApi } from "@plainworks/demo"
import { createMockServer } from "@plainworks/demo/server"
import { createMockIdp } from "@plainworks/mocks/idp"
import { fixedClock } from "@plainworks/std/time"
import { createShowcaseAuth, type ShowcaseSessionValue } from "../src/neutral/auth"
import { showcaseSessionSchema } from "../src/neutral/auth/session"
import { createNotificationMutationAuthorizer } from "../src/neutral/notifications"
import { createOrderMutationAuthorizer } from "../src/neutral/orders"
import {
  createSettingsMutationAuthorizer,
  createSettingsReadAuthorizer,
} from "../src/neutral/settings"

export const BACKEND_ORIGIN = "https://showcase.test"

/** The showcase's real server composition, minus HTTP: one session store, one mock IdP, one API. */
export interface ShowcaseBackend {
  readonly api: MockApi
  /** Sign in through the real OIDC flow and return the browser's `Cookie` header. */
  signIn(): Promise<string>
  /** Send a request to the mock backend as a browser would, cookies included. */
  send(path: string, init?: RequestInit): Promise<Response>
  /** Make every session-store call reject, as an outage would. */
  failStorage(): void
  close(): void
}

/** The signed-in principal the mock IdP issues; settings records are keyed by this subject. */
export const BACKEND_SUBJECT = "ada"

export async function createShowcaseBackend(
  claims: Record<string, unknown> = { name: "Ada" },
): Promise<ShowcaseBackend> {
  let storageDown = false
  const store = unavailableWhen(
    createMemorySessionStore({ schema: showcaseSessionSchema }),
    () => storageDown,
  )
  const idp = await createMockIdp({ subject: BACKEND_SUBJECT, claims })
  const auth = createShowcaseAuth({
    store,
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: `${BACKEND_ORIGIN}/auth/callback`,
    signingKey: crypto.getRandomValues(new Uint8Array(32)),
  })
  const api = createMockApi({
    clock: fixedClock("2026-01-15T12:00:00Z"),
    authorizeOrderMutation: createOrderMutationAuthorizer(auth.read),
    authorizeNotificationMutation: createNotificationMutationAuthorizer(auth.read),
    authorizeSettingsRead: createSettingsReadAuthorizer(auth.read),
    authorizeSettingsMutation: createSettingsMutationAuthorizer(auth.read),
  })
  const server = createMockServer(api)
  server.listen({ onUnhandledRequest: "error" })

  const backend: ShowcaseBackend = {
    api,
    async signIn() {
      const login = createRequestJar(new Request(BACKEND_ORIGIN))
      const begin = await auth.session.beginLogin(login.jar, { returnTo: "/" })
      const { callbackUrl } = idp.authorize(begin.authorizationUrl)
      const callback = createRequestJar({ headers: cookieHeaders(login.cookies) })
      const params = Object.fromEntries(new URL(callbackUrl).searchParams)
      await auth.session.completeLogin(callback.jar, { params })
      return cookieHeaders([...login.cookies, ...callback.cookies]).get("cookie") ?? ""
    },
    send: (path, init) => fetch(new URL(path, BACKEND_ORIGIN), init),
    failStorage() {
      storageDown = true
    },
    close() {
      server.close()
    },
  }
  return backend
}

/** Fold `Set-Cookie` lines into the `Cookie` header a browser would send next; expiry deletes. */
function cookieHeaders(setCookies: readonly string[]): Headers {
  const jar = new Map<string, string>()
  for (const line of setCookies) {
    const [pair = ""] = line.split(";")
    const name = pair.slice(0, pair.indexOf("="))
    if (/;\s*max-age=0/i.test(line)) jar.delete(name)
    else jar.set(name, pair.slice(pair.indexOf("=") + 1))
  }
  return new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") })
}

function unavailableWhen(
  store: OpaqueSessionStore<ShowcaseSessionValue>,
  down: () => boolean,
): OpaqueSessionStore<ShowcaseSessionValue> {
  const guard = <T>(call: () => Promise<T>): Promise<T> =>
    down() ? Promise.reject(new Error("session storage unavailable")) : call()
  return {
    read: (...args) => guard(() => store.read(...args)),
    create: (...args) => guard(() => store.create(...args)),
    revoke: (...args) => guard(() => store.revoke(...args)),
    createLogin: (...args) => guard(() => store.createLogin(...args)),
    consumeLogin: (...args) => guard(() => store.consumeLogin(...args)),
  }
}
