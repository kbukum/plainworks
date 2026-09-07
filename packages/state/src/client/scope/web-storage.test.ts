// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the server-safe `.`
// entry can never lean on DOM globals unnoticed.
import { describe, expect, test } from "vitest"
import { StateSourceError } from "../../errors"
import { jsonSerializer } from "../../scope/serializer"
import {
  createWebStorageScope,
  persistentScope,
  sessionScope,
  type WebStorageLike,
} from "./web-storage"

interface Value {
  mode: string
}

function mapStorage(): WebStorageLike & { readonly map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

const spec = (key = "theme") => ({ key, serializer: jsonSerializer<Value>() })

describe("web storage scope backend", () => {
  test("persistent reports durable, cross-tab, host-bound capabilities", () => {
    const source = persistentScope.createSource(spec())
    expect(source.capabilities).toEqual({
      access: "sync",
      authority: "local",
      durable: true,
      sharedAcrossTabs: true,
      sentToServer: false,
      availableAtImport: false,
    })
  })

  test("writes, reads, and clears through the injected storage, notifying local subscribers", async () => {
    const storage = mapStorage()
    const source = createWebStorageScope({ kind: "persistent", storage }).createSource(spec())
    expect(await source.get()).toBeUndefined()
    let changes = 0
    source.subscribe(() => {
      changes += 1
    })
    await source.set({ mode: "dark" })
    expect(storage.map.get("theme")).toBe('{"mode":"dark"}')
    expect(await source.get()).toEqual({ mode: "dark" })
    expect(changes).toBe(1)
    await source.remove()
    expect(await source.get()).toBeUndefined()
    expect(changes).toBe(2)
  })

  test("a corrupt persisted string raises a typed StateSourceError, not a fabricated value", async () => {
    const storage = mapStorage()
    storage.map.set("theme", "{not json")
    const source = createWebStorageScope({ kind: "persistent", storage }).createSource(spec())
    await expect(source.get()).rejects.toBeInstanceOf(StateSourceError)
  })

  test("persistent observes cross-tab storage events for its key and tears them down", () => {
    const storage = mapStorage()
    const source = createWebStorageScope({ kind: "persistent", storage }).createSource(spec())
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }))
    expect(changes).toBe(1)
    // A different key is ignored; a whole-store clear (key === null) is observed.
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }))
    expect(changes).toBe(1)
    window.dispatchEvent(new StorageEvent("storage", { key: null }))
    expect(changes).toBe(2)
    subscription.unsubscribe()
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }))
    expect(changes).toBe(2)
  })

  test("ignores a same-key storage event from a different storage area", () => {
    const source = createWebStorageScope({ kind: "persistent" }).createSource(spec())
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    // A `sessionStorage` change carrying the same key must not trigger this localStorage-backed
    // source — the handler matches `storageArea`, not just the key.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", storageArea: window.sessionStorage }),
    )
    expect(changes).toBe(0)
    // The matching area (localStorage) still fires.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", storageArea: window.localStorage }),
    )
    expect(changes).toBe(1)
    subscription.unsubscribe()
  })

  test("session is per-tab: durable but not cross-tab, and ignores storage events", () => {
    const storage = mapStorage()
    const source = createWebStorageScope({ kind: "session", storage }).createSource(spec())
    expect(source.capabilities.sharedAcrossTabs).toBe(false)
    let changes = 0
    source.subscribe(() => {
      changes += 1
    })
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }))
    expect(changes).toBe(0)
  })

  test("the default host resolver uses jsdom's real localStorage", async () => {
    localStorage.clear()
    const source = persistentScope.createSource(spec())
    await source.set({ mode: "light" })
    expect(localStorage.getItem("theme")).toBe('{"mode":"light"}')
    localStorage.clear()
  })

  test("session default resolver never registers a cross-tab listener", () => {
    const source = sessionScope.createSource(spec())
    let changes = 0
    source.subscribe(() => {
      changes += 1
    })
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }))
    expect(changes).toBe(0)
  })
})
