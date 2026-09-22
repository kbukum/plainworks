// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { reserveBodyPadding } from "./body-reservation"

describe("reserveBodyPadding", () => {
  afterEach(() => {
    document.body.style.paddingBottom = ""
  })

  it("reserves space over the host's original padding and restores it on release", () => {
    document.body.style.paddingBottom = "10px"
    const release = reserveBodyPadding(36)
    expect(document.body.style.paddingBottom).toBe("46px")
    release()
    expect(document.body.style.paddingBottom).toBe("10px")
  })

  it("coordinates concurrent rails so releasing one keeps the other's reservation", () => {
    document.body.style.paddingBottom = "0px"
    const releaseA = reserveBodyPadding(36)
    const releaseB = reserveBodyPadding(36)
    expect(document.body.style.paddingBottom).toBe("72px")

    releaseA()
    // B is still mounted, so its reservation must remain rather than restore the original.
    expect(document.body.style.paddingBottom).toBe("36px")

    releaseB()
    expect(document.body.style.paddingBottom).toBe("0px")
  })

  it("ignores a double release", () => {
    document.body.style.paddingBottom = "0px"
    const release = reserveBodyPadding(36)
    release()
    release()
    expect(document.body.style.paddingBottom).toBe("0px")
  })
})
