import { describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { invalidateCache, optimisticUpdate, writeQueryData } from "./routing"

describe("cache routing", () => {
  describe("writeQueryData", () => {
    it("writes a value and folds a function updater over the previous value", () => {
      const client = createQueryClient()
      const key = ["count"]
      expect(writeQueryData<number>(client, key, 1)).toBe(1)
      expect(writeQueryData<number>(client, key, (previous) => (previous ?? 0) + 1)).toBe(2)
      expect(client.getQueryData(key)).toBe(2)
    })

    it("evicts the slot when the updater returns undefined", () => {
      const client = createQueryClient()
      const key = ["count"]
      writeQueryData<number>(client, key, 1)
      expect(client.getQueryData(key)).toBe(1)
      expect(writeQueryData<number>(client, key, () => undefined)).toBeUndefined()
      expect(client.getQueryData(key)).toBeUndefined()
    })
  })

  describe("invalidateCache", () => {
    it("marks a prefix-matched query stale", async () => {
      const client = createQueryClient()
      await client.query({ queryKey: ["users", 1], queryFn: async () => "ada" })
      const query = client.getQueryCache().find({ queryKey: ["users", 1] })
      expect(query?.state.isInvalidated).toBe(false)
      await invalidateCache(client, { queryKey: ["users"], refetchType: "none" })
      expect(query?.state.isInvalidated).toBe(true)
    })
  })

  describe("optimisticUpdate", () => {
    it("applies immediately and rolls back to the snapshot", () => {
      const client = createQueryClient()
      const key = ["profile"]
      writeQueryData<{ name: string }>(client, key, { name: "old" })

      const update = optimisticUpdate<{ name: string }>({
        client,
        queryKey: key,
        apply: (previous) => ({ name: `${previous?.name}->new` }),
      })
      expect(client.getQueryData(key)).toEqual({ name: "old->new" })
      expect(update.previous).toEqual({ name: "old" })

      update.rollback()
      expect(client.getQueryData(key)).toEqual({ name: "old" })
    })

    it("rolls back to undefined when the slot was empty", () => {
      const client = createQueryClient()
      const key = ["empty"]
      const update = optimisticUpdate<number>({ client, queryKey: key, apply: () => 42 })
      expect(client.getQueryData(key)).toBe(42)
      update.rollback()
      expect(client.getQueryData(key)).toBeUndefined()
    })

    it("does not clobber a newer write — rollback is compare-and-set on the applied value", () => {
      const client = createQueryClient()
      const key = ["profile"]
      writeQueryData<{ name: string }>(client, key, { name: "old" })

      // Update A writes, then a newer update B lands, then A's mutation fails: A's rollback must
      // not restore A's stale snapshot over B's value.
      const a = optimisticUpdate<{ name: string }>({
        client,
        queryKey: key,
        apply: () => ({ name: "from-a" }),
      })
      optimisticUpdate<{ name: string }>({
        client,
        queryKey: key,
        apply: () => ({ name: "from-b" }),
      })

      expect(a.rollback()).toBe(false)
      expect(client.getQueryData(key)).toEqual({ name: "from-b" })
    })

    it("refuses to roll back over a newer write that stored an equal value", () => {
      // Equal primitives are indistinguishable by value/reference, so the guard must be the write
      // revision: A writes 2, B writes 2, A fails — A must not restore its snapshot over B's write.
      const client = createQueryClient()
      const key = ["same"]
      writeQueryData<number>(client, key, 1)

      const a = optimisticUpdate<number>({ client, queryKey: key, apply: () => 2 })
      const b = optimisticUpdate<number>({ client, queryKey: key, apply: () => 2 })

      expect(a.rollback()).toBe(false)
      expect(client.getQueryData(key)).toBe(2)
      // b's own snapshot (the value a wrote) still restores fine — only the stale revision refuses.
      expect(b.rollback()).toBe(true)
      expect(client.getQueryData(key)).toBe(2)
    })

    it("refuses to roll back after the slot was evicted and rewritten", () => {
      // Eviction destroys the query object; a rewrite — even of the same value — is a new one.
      // The evicted write's snapshot belongs to a dead revision and must not return.
      const client = createQueryClient()
      const key = ["evicted"]
      writeQueryData<number>(client, key, 1)

      const update = optimisticUpdate<number>({ client, queryKey: key, apply: () => 2 })
      client.removeQueries({ queryKey: key, exact: true })
      writeQueryData<number>(client, key, 2)

      expect(update.rollback()).toBe(false)
      expect(client.getQueryData(key)).toBe(2)
    })

    it("restores when the cache still holds exactly what this update applied", () => {
      const client = createQueryClient()
      const key = ["profile"]
      writeQueryData<{ name: string }>(client, key, { name: "old" })
      const update = optimisticUpdate<{ name: string }>({
        client,
        queryKey: key,
        apply: () => ({ name: "new" }),
      })

      expect(update.rollback()).toBe(true)
      expect(client.getQueryData(key)).toEqual({ name: "old" })
    })

    it("optimistically clears a slot when apply returns undefined, and rolls the value back", () => {
      const client = createQueryClient()
      const key = ["profile"]
      writeQueryData<{ name: string }>(client, key, { name: "old" })

      // An optimistic delete: `setQueryData(key, undefined)` would be a no-op, so the slot must be evicted.
      const update = optimisticUpdate<{ name: string }>({
        client,
        queryKey: key,
        apply: () => undefined,
      })
      expect(client.getQueryData(key)).toBeUndefined()
      expect(update.previous).toEqual({ name: "old" })

      update.rollback()
      expect(client.getQueryData(key)).toEqual({ name: "old" })
    })
  })
})
