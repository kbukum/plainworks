// Default `node` environment: the URL backend is driven through an injected host, so no location is
// needed; the missing-host path is asserted separately.
import { describe, expect, test } from "vitest"
import { StateSourceError } from "../../errors"
import { stringSerializer } from "../../scope/serializer"
import { createUrlScope, type UrlHost, urlScope } from "./url"

function fakeHost(initial = "https://app.test/page"): UrlHost & {
  emit(): void
  readonly href: string
  readonly listenerCount: number
} {
  let href = initial
  const listeners = new Set<() => void>()
  return {
    read: () => href,
    replace: (next) => {
      href = next
    },
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    emit() {
      for (const listener of [...listeners]) listener()
    },
    get href() {
      return href
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

const spec = { key: "q", serializer: stringSerializer }

describe("url scope backend", () => {
  test("is shareable but not durable across a fresh navigation", () => {
    const source = createUrlScope({ host: fakeHost() }).createSource(spec)
    expect(source.capabilities.durable).toBe(false)
    expect(source.capabilities.sentToServer).toBe(false)
  })

  test("search mode writes, reads, and clears the query param", async () => {
    const host = fakeHost()
    const source = createUrlScope({ host }).createSource(spec)
    expect(await source.get()).toBeUndefined()
    await source.set("hello world")
    expect(host.href).toBe("https://app.test/page?q=hello+world")
    expect(await source.get()).toBe("hello world")
    await source.remove()
    expect(host.href).toBe("https://app.test/page")
    expect(await source.get()).toBeUndefined()
  })

  test("hash mode keeps the value in the fragment", async () => {
    const host = fakeHost()
    const source = createUrlScope({ host, mode: "hash" }).createSource(spec)
    await source.set("dark")
    expect(host.href).toBe("https://app.test/page#q=dark")
    expect(await source.get()).toBe("dark")
    await source.remove()
    expect(host.href).toBe("https://app.test/page")
  })

  test("observes navigation and tears the listener down on unsubscribe", () => {
    const host = fakeHost()
    const source = createUrlScope({ host }).createSource(spec)
    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    host.emit()
    expect(changes).toBe(1)
    subscription.unsubscribe()
    expect(host.listenerCount).toBe(0)
    host.emit()
    expect(changes).toBe(1)
  })

  test("the default host defers a typed location error to the first read", async () => {
    const source = urlScope.createSource(spec) // construction is host-free (SSR-safe)
    await expect(source.get()).rejects.toThrow(StateSourceError)
    await expect(source.get()).rejects.toThrow(/location/)
  })
})
