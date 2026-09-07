// @vitest-environment jsdom
// Exercises the URL scope's default host resolver against jsdom's real `location`/`history`, the
// path the injected-host tests deliberately bypass — proving the platform default works, mirroring
// `http`'s coverage of `resolveGlobalFetch`.
import { afterEach, describe, expect, test } from "vitest"
import { stringSerializer } from "../../scope/serializer"
import { urlScope } from "./url"

const spec = { key: "q", serializer: stringSerializer }

afterEach(() => {
  history.replaceState(null, "", "/")
})

describe("url scope default host", () => {
  test("writes to and reads from the real address bar, and observes navigation", async () => {
    const source = urlScope.createSource(spec)
    await source.set("hello")
    expect(location.search).toBe("?q=hello")
    expect(await source.get()).toBe("hello")

    let changes = 0
    const subscription = source.subscribe(() => {
      changes += 1
    })
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(changes).toBe(1)

    subscription.unsubscribe()
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(changes).toBe(1)

    await source.remove()
    expect(location.search).toBe("")
  })
})
