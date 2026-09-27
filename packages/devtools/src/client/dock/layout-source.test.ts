import { StateSourceError } from "@plainworks/state"
import type { WebStorageLike } from "@plainworks/state/client/scope"
import { describe, expect, it, vi } from "vitest"
import { createDevtoolsLayoutSource, DEVTOOLS_LAYOUT_KEY } from "./layout-source"

function memoryStorage(seed: Record<string, string> = {}): WebStorageLike & {
  readonly entries: Map<string, string>
} {
  const entries = new Map(Object.entries(seed))
  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void entries.set(key, value)),
    removeItem: vi.fn((key: string) => void entries.delete(key)),
  }
}

describe("createDevtoolsLayoutSource", () => {
  it("touches no storage until the layout is first read", () => {
    const storage = memoryStorage()
    createDevtoolsLayoutSource({ storage })
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it("round-trips a layout under the devtools key", async () => {
    const storage = memoryStorage()
    const source = createDevtoolsLayoutSource({ storage })
    expect(await source.get()).toBeUndefined()
    await source.set({ side: "left", inlineSize: 480 })
    expect(JSON.parse(storage.entries.get(DEVTOOLS_LAYOUT_KEY) ?? "")).toEqual({
      side: "left",
      inlineSize: 480,
    })
    expect(await createDevtoolsLayoutSource({ storage }).get()).toEqual({
      side: "left",
      inlineSize: 480,
    })
  })

  it("rejects a tampered layout with a typed error instead of adopting it", async () => {
    const storage = memoryStorage({ [DEVTOOLS_LAYOUT_KEY]: JSON.stringify({ side: "top" }) })
    await expect(createDevtoolsLayoutSource({ storage }).get()).rejects.toBeInstanceOf(
      StateSourceError,
    )
  })

  it("is durable, local, and never sent to the server", () => {
    expect(createDevtoolsLayoutSource({ storage: memoryStorage() }).capabilities).toMatchObject({
      durable: true,
      authority: "local",
      sentToServer: false,
    })
  })
})
