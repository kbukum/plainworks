import { fixedClock } from "@plainworks/std/time"
import { type AuthStore, createAuthStore, type SessionSnapshot } from "../session/store"

const FIXTURE_NOW = "2000-01-01T00:00:00Z"
const FIXTURE_EXPIRES_AT = "2000-01-01T01:00:00Z"

/**
 * A deterministic session runtime for component tests. The clock is fixed and the network
 * boundary is a stub that answers `/auth/session` with the seeded identity (200) or no session
 * (401), so hydration alone never certifies identity: the runtime still confirms through the same
 * protocol a real host speaks.
 */
export function createSessionFixture(snapshot?: SessionSnapshot): AuthStore {
  const identity = snapshot?.status === "authenticated" ? snapshot.identity : null
  return createAuthStore({
    clock: fixedClock(FIXTURE_NOW),
    ...(snapshot === undefined ? {} : { initialSnapshot: snapshot }),
    fetch: async () =>
      identity === null
        ? new Response("null", { status: 401 })
        : Response.json({
            status: "authenticated",
            identity: { ...identity, kind: "user", restrictions: { mode: "unrestricted" } },
            expiresAt: FIXTURE_EXPIRES_AT,
            csrfToken: "fixture-csrf",
          }),
  })
}
