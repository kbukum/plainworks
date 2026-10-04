import type { AuthAdapter } from "@plainworks/auth/adapter"
import { defaultAuthCrypto } from "@plainworks/auth/crypto"
import {
  createMemorySessionStore,
  createRequestJar,
  createServerSession,
  hmacSessionSigner,
} from "@plainworks/auth/server"
import { createOpaqueSessionStoreCases } from "@plainworks/auth/testing"
import { createMockIdp } from "@plainworks/mocks/idp"
import { base64urlEncode } from "@plainworks/std/encoding"
import { guardSchema } from "@plainworks/std/seam"

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

for (const scenario of createOpaqueSessionStoreCases()) {
  await scenario.run((options) => ({
    store: createMemorySessionStore(options),
    close: () => {},
  }))
}

const crypto = defaultAuthCrypto()
const transaction = base64urlEncode(crypto.randomBytes(32))
const identity = { subject: "consumer-user", kind: "user" as const }
const adapter: AuthAdapter = {
  id: "consumer-owned",
  authenticate: async () => identity,
  beginLogin: async () => ({
    authorizationUrl: "https://identity.example.test/authorize",
    transaction,
  }),
  completeLogin: async (request) => {
    check(request.transaction === transaction, "consumer adapter received a different transaction")
    return {
      identity,
      tokens: {
        accessToken: base64urlEncode(crypto.randomBytes(32)),
        expiresAt: Date.now() + 60_000,
      },
    }
  },
}
const schema = guardSchema((value): value is string => typeof value === "string")
const key = crypto.randomBytes(32)
const session = createServerSession({
  adapter,
  signer: hmacSessionSigner({ keys: [key] }),
  store: createMemorySessionStore({ schema }),
  sessionSchema: schema,
  toSessionValue: (value) => value.identity.subject,
  toIdentity: (subject) => ({
    subject,
    kind: "user",
    restrictions: { mode: "unrestricted" },
  }),
})
const cookies = new Map<string, string>()
const request = () =>
  createRequestJar({
    headers: new Headers({
      cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    }),
  })
function receive(values: readonly string[]): void {
  for (const serialized of values) {
    check(
      serialized.includes("Secure") && serialized.includes("HttpOnly"),
      "cookie lost server custody",
    )
    const pair = serialized.split(";")[0] ?? ""
    const separator = pair.indexOf("=")
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (value === "") cookies.delete(name)
    else cookies.set(name, value)
  }
}
try {
  const begin = request()
  const login = await session.beginLogin(begin.jar)
  receive(begin.cookies)
  check(login.authorizationUrl === "https://identity.example.test/authorize", "adapter not used")
  const callback = request()
  await session.completeLogin(callback.jar, { params: {} })
  receive(callback.cookies)
  check(
    (await session.status(request().jar)).identity.subject === identity.subject,
    "session not readable",
  )
  check(
    [...cookies.values()].every((cookie) => /^[A-Za-z0-9_-]{43}$/.test(cookie)),
    "browser cookie is not opaque",
  )
  const status = await session.status(request().jar)
  check(await session.verifyCsrf(request().jar, status.csrfToken), "published CSRF proof failed")
  const logout = request()
  await session.logout(logout.jar)
  receive(logout.cookies)
  check((await session.read(request().jar)) === undefined, "logged-out session remained readable")
} finally {
  key.fill(0)
  cookies.clear()
}

const idp = await createMockIdp()
try {
  const discovery = await idp.fetch(`${idp.issuer}/.well-known/openid-configuration`)
  check(discovery.status === 200, "core-only mock provider did not serve discovery")
} finally {
  idp.close()
}
