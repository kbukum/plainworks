import { isRecord } from "@plainworks/std"
import { guardSchema, type StandardSchemaV1 } from "@plainworks/std/seam"
import type { Clock } from "@plainworks/std/time"
import type { OpaqueSessionStore } from "../server/opaque-store"
import { abortedSignal, equal, rejects, steppedClock } from "./check"

/** Options a conformance case passes to the implementation under test. */
export interface OpaqueSessionStoreSubjectOptions<Value> {
  readonly schema: StandardSchemaV1<unknown, Value>
  readonly clock: Clock
  readonly capacity?: number
  readonly transactionCapacity?: number
}

/** A store under test and how to release what it owns. */
export interface StoreSubject<Store> {
  readonly store: Store
  close(): void | Promise<void>
}

/** Builds a fresh, empty implementation for one case. */
export type OpaqueSessionStoreFactory = <Value>(
  options: OpaqueSessionStoreSubjectOptions<Value>,
) => StoreSubject<OpaqueSessionStore<Value>> | Promise<StoreSubject<OpaqueSessionStore<Value>>>

/** One runner-neutral behavior; it throws when the implementation breaks the contract. */
export interface ConformanceCase<Factory> {
  readonly name: string
  run(factory: Factory): Promise<void>
}

const text = guardSchema((value): value is string => typeof value === "string")
const anything = guardSchema((_value): _value is unknown => true)
const profile = guardSchema(
  (value): value is { profile: { name: string } } =>
    isRecord(value) && isRecord(value.profile) && typeof value.profile.name === "string",
)

async function using<Value>(
  factory: OpaqueSessionStoreFactory,
  options: OpaqueSessionStoreSubjectOptions<Value>,
  body: (store: OpaqueSessionStore<Value>) => Promise<void>,
): Promise<void> {
  const subject = await factory(options)
  try {
    await body(subject.store)
  } finally {
    await subject.close()
  }
}

function login(reference: string, expiresAt = 1000) {
  return { reference, transaction: "server-only-pkce", returnTo: "/", expiresAt }
}

type Case = ConformanceCase<OpaqueSessionStoreFactory>

/**
 * The {@link OpaqueSessionStore} contract as runner-neutral cases. Run every case against each
 * implementation, including a consumer-supplied one, with only public exports.
 */
export function createOpaqueSessionStoreCases(): readonly Case[] {
  return [
    {
      name: "owns nested values and metadata on write and read",
      run: (factory) =>
        using(factory, { schema: profile, clock: steppedClock() }, async (store) => {
          const record = {
            reference: "one",
            value: { profile: { name: "Ada" } },
            expiresAt: 1000,
            providerHandle: "provider",
          }
          await store.create(record)
          record.value.profile.name = "changed"
          record.expiresAt = 1
          record.providerHandle = "other"
          const first = await store.read("one")
          equal(first?.value, { profile: { name: "Ada" } }, "stored value")
          equal(first?.expiresAt, 1000, "stored expiry")
          equal(first?.providerHandle, "provider", "stored handle")
          if (first !== undefined) first.value.profile.name = "changed-again"
          equal((await store.read("one"))?.value.profile.name, "Ada", "read isolation")
          equal(await store.revoke("one"), ["provider"], "revoked handles")
        }),
    },
    {
      name: "pending login custody cannot be mutated after admission",
      run: (factory) =>
        using(factory, { schema: text, clock: steppedClock() }, async (store) => {
          const pending = { ...login("login"), previous: "family" }
          await store.createLogin(pending)
          pending.previous = "other"
          pending.transaction = "changed"
          const consumed = await store.consumeLogin("login")
          equal(consumed?.previous, "family", "admitted previous")
          equal(consumed?.transaction, "server-only-pkce", "admitted transaction")
        }),
    },
    ...[undefined, new Date(0), { nested: undefined }, { n: Number.NaN }, [1n]].map(
      (value, index): Case => ({
        name: `rejects lossy value #${index} before replacing a live generation`,
        run: (factory) =>
          using(factory, { schema: anything, clock: steppedClock() }, async (store) => {
            await store.create({ reference: "one", value: "valid", expiresAt: 1000 })
            await rejects(
              () => store.create({ reference: "two", value, expiresAt: 1000 }, "one"),
              "auth/session-invalid",
              "lossy value",
            )
            equal((await store.read("one"))?.value, "valid", "live generation")
          }),
      }),
    ),
    {
      name: "rejects oversized values",
      run: (factory) =>
        using(factory, { schema: anything, clock: steppedClock() }, async (store) => {
          await rejects(
            () => store.create({ reference: "big", value: "x".repeat(70_000), expiresAt: 1000 }),
            "auth/session-invalid",
            "64 KiB bound",
          )
          let deep: unknown = "leaf"
          for (let i = 0; i < 40; i++) deep = [deep]
          await rejects(
            () => store.create({ reference: "deep", value: deep, expiresAt: 1000 }),
            "auth/session-invalid",
            "depth bound",
          )
        }),
    },
    {
      name: "schema failures and invalid expiry are explicit",
      run: (factory) => {
        const schema = guardSchema((v): v is string => typeof v === "string" && v !== "bad")
        return using(factory, { schema, clock: steppedClock() }, async (store) => {
          await rejects(
            () => store.create({ reference: "one", value: "bad", expiresAt: 1000 }),
            "auth/session-invalid",
            "schema failure",
          )
          await rejects(
            () => store.create({ reference: "two", value: "ok", expiresAt: 3_600_001 }),
            "auth/session-invalid",
            "expiry over one hour",
          )
          await rejects(
            () => store.createLogin(login("login", 0)),
            "auth/login-transaction",
            "expired login",
          )
          await rejects(
            () => store.createLogin(login("late", 600_001)),
            "auth/login-transaction",
            "login over ten minutes",
          )
        })
      },
    },
    {
      name: "replacement is single-winner and preserves absolute expiry",
      run: (factory) =>
        using(factory, { schema: text, clock: steppedClock() }, async (store) => {
          await store.create({ reference: "one", value: "identity", expiresAt: 1000 })
          await rejects(
            () => store.create({ reference: "longer", value: "identity", expiresAt: 2000 }, "one"),
            "auth/session-invalid",
            "extended expiry",
          )
          const results = await Promise.allSettled([
            store.create({ reference: "two", value: "identity", expiresAt: 1000 }, "one"),
            store.create({ reference: "three", value: "identity", expiresAt: 1000 }, "one"),
          ])
          equal(
            results.map((r) => r.status).sort(),
            ["fulfilled", "rejected"],
            "concurrent replacement",
          )
          equal(await store.read("one"), undefined, "replaced generation")
          await store.revoke("one")
          equal(await store.read("two"), undefined, "family revoked")
          equal(await store.read("three"), undefined, "family revoked")
        }),
    },
    {
      name: "bounded storage keeps tombstones without evicting live sessions",
      run: (factory) => {
        const clock = steppedClock()
        return using(factory, { schema: text, clock, capacity: 2 }, async (store) => {
          await store.create({ reference: "one", value: "first", expiresAt: 1000 })
          await store.create({ reference: "two", value: "second", expiresAt: 1000 }, "one")
          equal(await store.read("one"), undefined, "superseded")
          equal((await store.read("two"))?.value, "second", "live")
          await rejects(
            () => store.create({ reference: "three", value: "overflow", expiresAt: 1000 }),
            "auth/store-unavailable",
            "capacity",
          )
          await store.revoke("one")
          equal(await store.read("two"), undefined, "family revoked")
          await rejects(
            () => store.create({ reference: "three", value: "late", expiresAt: 1000 }, "two"),
            "auth/session-revoked",
            "late replacement",
          )
          equal(await store.revoke("missing"), [], "unknown revoke")
          clock.set(601_000)
          await store.create({ reference: "three", value: "cleaned", expiresAt: 602_000 })
          equal((await store.read("three"))?.value, "cleaned", "capacity released after retention")
        })
      },
    },
    {
      name: "login transactions are one-time, bounded, and release capacity",
      run: (factory) => {
        const clock = steppedClock()
        return using(factory, { schema: text, clock, transactionCapacity: 1 }, async (store) => {
          for (let index = 0; index < 100; index++) {
            const pending = login(`protected-${index}`)
            await store.createLogin(pending)
            await rejects(
              () => store.createLogin(login("overflow")),
              "auth/store-unavailable",
              "login capacity",
            )
            const both = await Promise.all([
              store.consumeLogin(pending.reference),
              store.consumeLogin(pending.reference),
            ])
            equal(
              both.filter((r) => r !== undefined),
              [pending],
              "single consume",
            )
          }
          await store.createLogin(login("expired"))
          clock.set(1000)
          equal(await store.consumeLogin("expired"), undefined, "expired login")
        })
      },
    },
    {
      name: "expiry denies reads and replacement but keeps provider custody for logout",
      run: (factory) => {
        const clock = steppedClock()
        return using(factory, { schema: text, clock }, async (store) => {
          await store.create({
            reference: "expired",
            value: "identity",
            expiresAt: 1000,
            providerHandle: "provider-slot",
          })
          clock.set(1000)
          equal(await store.read("expired"), undefined, "expired read")
          await rejects(
            () =>
              store.create({ reference: "next", value: "identity", expiresAt: 2000 }, "expired"),
            "auth/session-revoked",
            "expired replacement",
          )
          equal(await store.revoke("expired"), ["provider-slot"], "retained handles")
        })
      },
    },
    {
      name: "an aborted signal rejects before any work",
      run: (factory) =>
        using(factory, { schema: text, clock: steppedClock() }, async (store) => {
          const aborted = abortedSignal()
          await rejects(() => store.read("one", aborted), undefined, "read")
          await rejects(
            () =>
              store.create({ reference: "one", value: "v", expiresAt: 1000 }, undefined, aborted),
            undefined,
            "create",
          )
          equal(await store.read("one"), undefined, "no partial create")
        }),
    },
  ]
}
