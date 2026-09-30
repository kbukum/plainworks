import { describe, expect, it } from "vitest"
import { createRequestJar } from "./jar"

// The jar reads inbound cookies from the request and buffers every cookie the auth flow mints, so
// a route can append them all to its response.

describe("createRequestJar", () => {
  it("reads inbound cookies from the Cookie header", () => {
    const { jar } = createRequestJar({ headers: new Headers({ cookie: "a=1; __Host-s=two" }) })
    expect(jar.get("a")).toBe("1")
    expect(jar.get("__Host-s")).toBe("two")
    expect(jar.get("missing")).toBeUndefined()
  })

  it("reads nothing when the request has no Cookie header", () => {
    const { jar } = createRequestJar({ headers: new Headers() })
    expect(jar.get("a")).toBeUndefined()
  })

  it("buffers every minted Set-Cookie in order", () => {
    const { jar, cookies } = createRequestJar({ headers: new Headers() })
    jar.set("a=1; Path=/")
    jar.set("b=2; Path=/")
    expect(cookies).toEqual(["a=1; Path=/", "b=2; Path=/"])
  })
})
