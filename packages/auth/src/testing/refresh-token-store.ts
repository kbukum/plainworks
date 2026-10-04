import type { Clock } from "@plainworks/std/time"
import type { RefreshTokenStore } from "../adapter/oidc/refresh-store"
import { abortedSignal, equal, rejects, steppedClock } from "./check"
import type { ConformanceCase, StoreSubject } from "./opaque-session-store"

/** Options a conformance case passes to the implementation under test. */
export interface RefreshTokenStoreSubjectOptions {
  readonly clock: Clock
  readonly ttlSeconds?: number
  readonly maxEntries?: number
}

/** Builds a fresh, empty implementation for one case. */
export type RefreshTokenStoreFactory = (
  options: RefreshTokenStoreSubjectOptions,
) => StoreSubject<RefreshTokenStore> | Promise<StoreSubject<RefreshTokenStore>>

type Case = ConformanceCase<RefreshTokenStoreFactory>

async function using(
  factory: RefreshTokenStoreFactory,
  options: RefreshTokenStoreSubjectOptions,
  body: (store: RefreshTokenStore) => Promise<void>,
): Promise<void> {
  const subject = await factory(options)
  try {
    await body(subject.store)
  } finally {
    await subject.close()
  }
}

/** The {@link RefreshTokenStore} contract (RFC 9700 rotation with reuse detection) as cases. */
export function createRefreshTokenStoreCases(): readonly Case[] {
  return [
    {
      name: "issues, reads, and revokes by handle",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await store.issue("one", "rt-1")
          equal(await store.current("one"), "rt-1", "issued")
          equal(await store.current("two"), undefined, "unknown")
          await store.revoke("one")
          equal(await store.current("one"), undefined, "revoked")
        }),
    },
    {
      name: "rotates only the live token and purges the family on reuse",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await store.issue("one", "rt-1")
          equal(await store.rotate("one", "rt-1", "rt-2"), { status: "rotated" }, "first")
          equal(await store.rotate("one", "rt-2", "rt-3"), { status: "rotated" }, "second")
          equal(await store.current("one"), "rt-3", "live")
          equal(await store.rotate("one", "rt-1", "rt-x"), { status: "reuse-detected" }, "replay")
          equal(await store.current("one"), undefined, "family purged")
          equal(await store.rotate("ghost", "a", "b"), { status: "reuse-detected" }, "unknown")
        }),
    },
    {
      name: "concurrent rotation has one winner",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await store.issue("one", "rt-1")
          const results = await Promise.all([
            store.rotate("one", "rt-1", "rt-a"),
            store.rotate("one", "rt-1", "rt-b"),
          ])
          equal(results.filter((r) => r.status === "rotated").length, 1, "single rotation winner")
          equal(await store.current("one"), undefined, "loser purges the family")
        }),
    },
    {
      name: "revocation is retained so late admission cannot revive a handle",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await store.revoke("pending")
          await rejects(() => store.issue("pending", "late"), "auth/session-revoked", "late")
          equal(await store.current("pending"), undefined, "still revoked")
          await store.issue("used", "rt")
          await rejects(() => store.issue("used", "again"), "auth/session-revoked", "reissue")
        }),
    },
    {
      name: "capacity is bounded without evicting live custody",
      run: (factory) =>
        using(factory, { clock: steppedClock(), maxEntries: 2 }, async (store) => {
          await store.issue("one", "rt-1")
          await store.issue("two", "rt-2")
          await rejects(() => store.issue("three", "rt-3"), "auth/store-unavailable", "capacity")
          equal(await store.current("one"), "rt-1", "live kept")
          equal(await store.current("two"), "rt-2", "live kept")
        }),
    },
    {
      name: "expiry is absolute and rotation does not extend it",
      run: (factory) => {
        const clock = steppedClock()
        return using(factory, { clock, ttlSeconds: 1, maxEntries: 2 }, async (store) => {
          await store.issue("one", "first")
          clock.set(900)
          await store.rotate("one", "first", "second")
          clock.set(1000)
          equal(await store.current("one"), undefined, "expired")
          await store.issue("two", "rt")
          await store.issue("three", "rt")
          equal(await store.current("three"), "rt", "expired entries release capacity")
        })
      },
    },
    {
      name: "rejects invalid handles and tokens",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await rejects(() => store.issue("", "rt"), "auth/refresh-failed", "empty handle")
          await rejects(() => store.issue("h", ""), "auth/refresh-failed", "empty token")
          await rejects(
            () => store.issue("h", "x".repeat(16_385)),
            "auth/refresh-failed",
            "oversized token",
          )
        }),
    },
    {
      name: "an aborted signal rejects before any work",
      run: (factory) =>
        using(factory, { clock: steppedClock() }, async (store) => {
          await rejects(() => store.issue("one", "rt", abortedSignal()), undefined, "issue")
          equal(await store.current("one"), undefined, "no partial issue")
        }),
    },
  ]
}
