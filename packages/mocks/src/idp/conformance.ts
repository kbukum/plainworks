import { fixedClock } from "@plainworks/std/time"
import { createMockIdp, type MockIdp } from "./provider"
import type { MockIdpState } from "./state"

/** Shared fixture data under test. Each `open` returns another handle over the same data. */
export interface MockIdpStateSubject {
  /** A new handle; closing it must not affect other handles. */
  open(): MockIdpState
  /** Release everything the subject owns, including handles a case left open. */
  dispose(): void | Promise<void>
}

/** Builds fresh, empty shared data for one case. */
export type MockIdpStateFactory = () => MockIdpStateSubject | Promise<MockIdpStateSubject>

/** One runner-neutral behavior; it throws when the state breaks the contract. */
export interface MockIdpStateCase {
  readonly name: string
  run(factory: MockIdpStateFactory): Promise<void>
}

const clock = fixedClock(1_700_000_000_000)
const VERIFIER = "pkce-verifier-value"
// RFC 7636 S256 of VERIFIER, precomputed so the cases need no host crypto.
const CHALLENGE = "mi0XaPnmofadvDGvNZxI2PQF3r3No7Rff42h5tdwbjI"
const REDIRECT = "https://app.test/auth/callback"

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`mock IdP state contract: ${message}`)
}

function authorize(idp: MockIdp): string {
  const url = new URL(`${idp.issuer}/authorize`)
  url.searchParams.set("redirect_uri", REDIRECT)
  url.searchParams.set("nonce", "nonce")
  url.searchParams.set("state", "state")
  url.searchParams.set("code_challenge", CHALLENGE)
  url.searchParams.set("code_challenge_method", "S256")
  return idp.authorize(url.toString()).code
}

const token = (idp: MockIdp, params: Record<string, string>) =>
  idp.fetch(`${idp.issuer}/token`, {
    method: "POST",
    body: new URLSearchParams(params).toString(),
  })

const redeem = (idp: MockIdp, code: string, verifier = VERIFIER) =>
  token(idp, { grant_type: "authorization_code", code, code_verifier: verifier })

const refresh = (idp: MockIdp, refreshToken: string) =>
  token(idp, { grant_type: "refresh_token", refresh_token: refreshToken })

async function refreshTokenOf(response: { json(): Promise<unknown> }): Promise<string> {
  const body = (await response.json()) as { refresh_token?: unknown }
  if (typeof body.refresh_token !== "string") throw new Error("token response lacks refresh")
  return body.refresh_token
}

const jwks = async (idp: MockIdp): Promise<string> =>
  JSON.stringify(await (await idp.fetch(`${idp.issuer}/jwks`)).json())

/** Two providers over two handles of one subject; everything is released afterwards. */
async function using(
  factory: MockIdpStateFactory,
  body: (
    providers: readonly [MockIdp, MockIdp],
    open: () => Promise<MockIdp>,
    subject: MockIdpStateSubject,
  ) => Promise<void>,
): Promise<void> {
  const subject = await factory()
  const owned: { close(): void }[] = []
  const open = async (): Promise<MockIdp> => {
    const state = subject.open()
    owned.push(state)
    const idp = await createMockIdp({ state, clock, alg: "ES256" })
    owned.push(idp)
    return idp
  }
  try {
    await body([await open(), await open()], open, subject)
  } finally {
    for (const resource of owned.reverse()) resource.close()
    await subject.dispose()
  }
}

/** The behaviors every {@link MockIdpState} must keep across independent handles. */
export function createMockIdpStateCases(): readonly MockIdpStateCase[] {
  return [
    {
      name: "handles share one signing identity, including a handle opened later",
      run: (factory) =>
        using(factory, async ([first, second], open) => {
          const published = await jwks(first)
          check((await jwks(second)) === published, "second handle sees another key")
          first.close()
          check((await jwks(await open())) === published, "a later handle sees another key")
        }),
    },
    {
      name: "a code redeems once across handles, and only with its PKCE verifier",
      run: (factory) =>
        using(factory, async ([first, second]) => {
          const code = authorize(first)
          check((await redeem(second, code, "wrong-verifier")).status === 400, "PKCE skipped")
          check((await redeem(second, code)).status === 200, "code not shared")
          check((await redeem(first, code)).status === 400, "code redeemed twice")
        }),
    },
    {
      name: "concurrent redemption on two handles consumes the code once",
      run: (factory) =>
        using(factory, async ([first, second]) => {
          const code = authorize(first)
          const statuses = (await Promise.all([redeem(first, code), redeem(second, code)]))
            .map((response) => response.status)
            .sort()
          check(statuses.join() === "200,400", `statuses were ${statuses.join()}`)
        }),
    },
    {
      name: "refresh rotation on one handle retires the old token on every handle",
      run: (factory) =>
        using(factory, async ([first, second]) => {
          const original = await refreshTokenOf(await redeem(first, authorize(first)))
          const rotated = await refresh(second, original)
          check(rotated.status === 200, "refresh not shared")
          check((await refresh(first, original)).status === 400, "old refresh reused")
          check((await refresh(first, await refreshTokenOf(rotated))).status === 200, "lost")
        }),
    },
    {
      name: "a failure control set on one handle fires once on another",
      run: (factory) =>
        using(factory, async ([first, second]) => {
          first.failNextTokenExchange()
          check((await refresh(second, "unknown")).status === 503, "control not shared")
          check((await refresh(first, "unknown")).status === 400, "control fired twice")
        }),
    },
    {
      name: "a failed transaction leaves the shared data unchanged",
      run: (factory) =>
        using(factory, async (_providers, _open, subject) => {
          const writer = subject.open()
          const reader = subject.open()
          try {
            const before = reader.transact((data) => data.counter)
            let thrown = false
            try {
              writer.transact((data) => {
                data.counter += 1
                throw new Error("rollback")
              })
            } catch {
              thrown = true
            }
            check(thrown, "the failure was swallowed")
            check(reader.transact((data) => data.counter) === before, "partial commit")
          } finally {
            writer.close()
            reader.close()
          }
        }),
    },
    {
      name: "a closed handle rejects transactions without closing other handles",
      run: (factory) =>
        using(factory, async (_providers, _open, subject) => {
          const closed = subject.open()
          const other = subject.open()
          try {
            closed.close()
            let rejected = false
            try {
              closed.transact((data) => data.counter)
            } catch {
              rejected = true
            }
            check(rejected, "closed handle still transacts")
            other.transact((data) => data.counter)
          } finally {
            other.close()
          }
        }),
    },
  ]
}
