import { validateWithSchema } from "@plainworks/std"
import { expect, test } from "vitest"
import { fakeSchema, guardSchema } from "./schema"

interface Widget {
  readonly id: number
}

function isWidget(value: unknown): value is Widget {
  return typeof value === "object" && value !== null && typeof (value as Widget).id === "number"
}

test("fakeSchema accepts a value and reports the configured vendor", async () => {
  const schema = fakeSchema<Widget>((value) => ({ value: value as Widget }), { vendor: "demo" })
  expect(schema["~standard"].vendor).toBe("demo")
  const result = await validateWithSchema(schema, { id: 1 })
  expect(result).toEqual({ ok: true, value: { id: 1 } })
})

test("fakeSchema surfaces the configured issues on rejection", async () => {
  const schema = fakeSchema<Widget>(() => ({ issues: [{ message: "nope" }] }))
  const result = await validateWithSchema(schema, { id: 1 })
  expect(result).toEqual({ ok: false, error: [{ message: "nope" }] })
})

test("fakeSchema can validate asynchronously", async () => {
  const schema = fakeSchema<Widget>((value) => ({ value: value as Widget }), { async: true })
  const outcome = schema["~standard"].validate({ id: 2 })
  expect(outcome).toBeInstanceOf(Promise)
  expect(await outcome).toEqual({ value: { id: 2 } })
})

test("guardSchema narrows a matching value and rejects a mismatch with a message", async () => {
  const schema = guardSchema(isWidget, "not a widget")
  await expect(validateWithSchema(schema, { id: 7 })).resolves.toEqual({
    ok: true,
    value: { id: 7 },
  })
  await expect(validateWithSchema(schema, { id: "x" })).resolves.toEqual({
    ok: false,
    error: [{ message: "not a widget" }],
  })
})
