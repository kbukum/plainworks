import { describe, expect, test } from "vitest"
import { memoryScope } from "./memory"
import { jsonSerializer } from "./serializer"

const spec = { key: "value", serializer: jsonSerializer<number>() }

describe("memoryScope", () => {
  test("reports transient, host-free capabilities", () => {
    const source = memoryScope.createSource(spec)
    expect(source.capabilities).toEqual({
      access: "sync",
      authority: "local",
      durable: false,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: true,
    })
  })

  test("starts empty, then reads back what was written", async () => {
    const source = memoryScope.createSource(spec)
    expect(await source.get()).toBeUndefined()
    await source.set(41)
    expect(await source.get()).toBe(41)
    await source.remove()
    expect(await source.get()).toBeUndefined()
  })

  test("notifies subscribers on write and stops after unsubscribe", async () => {
    const source = memoryScope.createSource(spec)
    let changes = 0
    const sub = source.subscribe(() => {
      changes += 1
    })
    await source.set(1)
    await source.set(2)
    expect(changes).toBe(2)
    sub.unsubscribe()
    await source.set(3)
    expect(changes).toBe(2)
  })

  test("each createSource call is an isolated slot (no shared module state)", async () => {
    const a = memoryScope.createSource(spec)
    const b = memoryScope.createSource(spec)
    await a.set(10)
    expect(await a.get()).toBe(10)
    expect(await b.get()).toBeUndefined()
  })
})
