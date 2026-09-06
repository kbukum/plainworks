import { describe, expect, test } from "vitest"
import { type StandardSchemaV1, unsafePassthrough, validateWithSchema } from "./schema"

interface Widget {
  readonly id: number
}

/** A minimal Standard Schema over `Widget`, sync or async, to drive the seam without a real library. */
function widgetSchema(options: { async?: boolean } = {}): StandardSchemaV1<unknown, Widget> {
  const validate = (
    value: unknown,
  ): { value: Widget } | { issues: ReadonlyArray<{ message: string }> } =>
    typeof value === "object" && value !== null && typeof (value as Widget).id === "number"
      ? { value: value as Widget }
      : { issues: [{ message: "id must be a number" }] }
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => (options.async ? Promise.resolve(validate(value)) : validate(value)),
    },
  }
}

describe("validateWithSchema", () => {
  test("returns ok with the parsed value on success", async () => {
    const result = await validateWithSchema(widgetSchema(), { id: 1 })
    expect(result).toEqual({ ok: true, value: { id: 1 } })
  })

  test("returns err with the issues on failure", async () => {
    const result = await validateWithSchema(widgetSchema(), { id: "x" })
    expect(result).toEqual({ ok: false, error: [{ message: "id must be a number" }] })
  })

  test("awaits an async validator", async () => {
    const result = await validateWithSchema(widgetSchema({ async: true }), { id: 2 })
    expect(result).toEqual({ ok: true, value: { id: 2 } })
  })
})

describe("unsafePassthrough", () => {
  test("returns the value unchanged as the opted-in type, with no validation", async () => {
    const schema = unsafePassthrough<Widget>()
    const anything = { id: "not-a-number", extra: true }
    const result = await validateWithSchema(schema, anything)
    expect(result).toEqual({ ok: true, value: anything })
  })

  test("advertises the plainworks vendor at version 1", () => {
    const schema = unsafePassthrough<Widget>()
    expect(schema["~standard"].version).toBe(1)
    expect(schema["~standard"].vendor).toBe("plainworks")
  })
})
