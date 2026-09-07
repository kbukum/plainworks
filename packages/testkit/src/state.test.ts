import { describe, expect, test } from "vitest"
import { asyncStateSource, fakeStateSource } from "./state"

describe("fakeStateSource", () => {
  test("reads back writes and reports the value synchronously", async () => {
    const source = fakeStateSource<number>()
    expect(source.current).toBeUndefined()
    expect(await source.get()).toBeUndefined()
    await source.set(5)
    expect(source.current).toBe(5)
    expect(await source.get()).toBe(5)
    await source.remove()
    expect(source.current).toBeUndefined()
  })

  test("seeds from initial and merges capability overrides", () => {
    const source = fakeStateSource<string>({
      initial: "dark",
      capabilities: { durable: true, sentToServer: true },
    })
    expect(source.current).toBe("dark")
    expect(source.capabilities.durable).toBe(true)
    expect(source.capabilities.sentToServer).toBe(true)
    expect(source.capabilities.access).toBe("sync")
  })

  test("notifies subscribers and counts teardown", async () => {
    const source = fakeStateSource<number>()
    let changes = 0
    const sub = source.subscribe(() => {
      changes += 1
    })
    expect(source.subscriberCount).toBe(1)
    await source.set(1)
    expect(changes).toBe(1)
    sub.unsubscribe()
    expect(source.subscriberCount).toBe(0)
    await source.set(2)
    expect(changes).toBe(1)
  })
})

describe("asyncStateSource", () => {
  test("gates reads until released", async () => {
    const source = asyncStateSource<number>({ initial: 7 })
    expect(source.capabilities.access).toBe("async")
    expect(source.capabilities.authority).toBe("remote")

    let resolved: number | undefined = -1
    const read = source.get().then((value) => {
      resolved = value
    })
    expect(source.pendingReads).toBe(1)
    expect(resolved).toBe(-1)

    await source.releaseReads()
    await read
    expect(resolved).toBe(7)
    expect(source.pendingReads).toBe(0)
  })

  test("externalSet updates the value and notifies without releasing reads", async () => {
    const source = asyncStateSource<number>({ initial: 1 })
    let changes = 0
    const sub = source.subscribe(() => {
      changes += 1
    })
    expect(source.subscriberCount).toBe(1)
    source.externalSet(9)
    expect(changes).toBe(1)
    expect(source.current).toBe(9)

    const read = source.get()
    await source.releaseReads()
    expect(await read).toBe(9)

    await source.remove()
    expect(source.current).toBeUndefined()
    expect(changes).toBe(2)
    sub.unsubscribe()
    expect(source.subscriberCount).toBe(0)
  })
})
