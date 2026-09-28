import { describe, expect, it } from "vitest"
import { devtoolsEnabled, SHOWCASE_DEVTOOLS_KEY } from "./enabled"

const storage = (values: Record<string, string>) => () => ({
  getItem: (key: string) => values[key] ?? null,
})

describe("devtoolsEnabled", () => {
  it("starts the inspector unless the profile turned it off", () => {
    expect(devtoolsEnabled(storage({}))).toBe(true)
    expect(devtoolsEnabled(storage({ [SHOWCASE_DEVTOOLS_KEY]: "on" }))).toBe(true)
    expect(devtoolsEnabled(storage({ [SHOWCASE_DEVTOOLS_KEY]: "off" }))).toBe(false)
  })

  it("keeps the inspector on when storage cannot be read", () => {
    expect(
      devtoolsEnabled(() => {
        throw new DOMException("denied", "SecurityError")
      }),
    ).toBe(true)
  })
})
