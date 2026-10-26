import { describe, expect, test } from "vitest"
import type { FormObjectSchema } from "./form"
import { createFieldsForm, FormFieldsError } from "./form-fields"
import { validateWithSchema } from "./schema"

const fields: FormObjectSchema = {
  type: "object",
  required: ["name", "temperature", "stop"],
  properties: {
    name: { type: "string", title: "Name", minLength: 2, maxLength: 8, pattern: "[a-z]+" },
    temperature: { type: "number", minimum: 0, maximum: 2 },
    tokens: { type: "integer", minimum: 1 },
    stream: { type: "boolean" },
    mode: {
      type: "string",
      oneOf: [
        { const: "fast", title: "Fast" },
        { const: "slow", title: "Slow" },
      ],
    },
    tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, maxItems: 1 },
    stop: {
      type: "object",
      required: ["word"],
      properties: { word: { type: "string" }, note: { type: "string", format: "textarea" } },
    },
  },
}

const form = createFieldsForm(fields)

describe("createFieldsForm", () => {
  test("exposes its fields for rendering", () => {
    expect(form.fields).toBe(fields)
  })

  test("keeps checked booleans in optional nested groups and rejects invalid values", async () => {
    const optional = createFieldsForm({
      type: "object",
      properties: {
        options: {
          type: "object",
          properties: { enabled: { type: "boolean" } },
        },
      },
    })
    expect(await validateWithSchema(optional, { "options.enabled": "on" })).toEqual({
      ok: true,
      value: { options: { enabled: true } },
    })
    expect(await validateWithSchema(optional, { "options.enabled": "false" })).toEqual({
      ok: true,
      value: {},
    })
    expect((await validateWithSchema(optional, { "options.enabled": "invalid" })).ok).toBe(false)
  })

  test("decodes control strings into typed JSON", async () => {
    const result = await validateWithSchema(form, {
      name: "abc",
      temperature: "0.5",
      tokens: "12",
      stream: "on",
      mode: "slow",
      tags: "b",
      "stop.word": "END",
      "stop.note": "",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: "abc",
        temperature: 0.5,
        tokens: 12,
        stream: true,
        mode: "slow",
        tags: ["b"],
        stop: { word: "END" },
      },
    })
  })

  test("leaves an empty optional field out and an unchecked switch false", async () => {
    const result = await validateWithSchema(form, {
      name: "ab",
      temperature: "1",
      tokens: "",
      "stop.word": "x",
    })
    expect(result).toEqual({
      ok: true,
      value: { name: "ab", temperature: 1, stream: false, tags: [], stop: { word: "x" } },
    })
  })

  test("reports each broken rule on its control name", async () => {
    const result = await validateWithSchema(form, {
      name: "A",
      temperature: "3",
      tokens: "1.5",
      stream: "maybe",
      mode: "medium",
      tags: ["a", "b"],
      "stop.word": "",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.map((issue) => [issue.path?.join("."), issue.reason])).toEqual([
      ["name", "OUT_OF_RANGE"],
      ["temperature", "OUT_OF_RANGE"],
      ["tokens", "INVALID_FORMAT"],
      ["stream", "INVALID_VALUE"],
      ["mode", "INVALID_VALUE"],
      ["tags", "OUT_OF_RANGE"],
      ["stop.word", "REQUIRED"],
    ])
  })

  test("checks a pattern against the whole value", async () => {
    const result = await validateWithSchema(form, {
      name: "ab1",
      temperature: "1",
      "stop.word": "x",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual([
      { path: ["name"], reason: "INVALID_FORMAT", message: "Enter a valid value." },
    ])
  })

  test("refuses a required field left out and an unknown control", async () => {
    const result = await validateWithSchema(form, { "stop.word": "x", extra: "1" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.map((issue) => [issue.path?.join("."), issue.reason])).toEqual([
      ["name", "REQUIRED"],
      ["temperature", "REQUIRED"],
      [undefined, "INVALID_VALUE"],
    ])
  })

  test("refuses input that is not a control record", async () => {
    for (const input of [null, "x", { name: 1 }, { name: ["a", 2] }]) {
      const result = await validateWithSchema(form, input)
      expect(result.ok).toBe(false)
    }
  })

  test("uses message overrides", async () => {
    const custom = createFieldsForm(fields, { required: () => "Fill this in." })
    const result = await validateWithSchema(custom, { name: "ab", "stop.word": "x" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error[0]?.message).toBe("Fill this in.")
  })

  test("refuses a schema it cannot honour when created", () => {
    expect(() =>
      createFieldsForm({ type: "object", properties: { a: { type: "string", pattern: "(" } } }),
    ).toThrow(FormFieldsError)
    expect(() =>
      createFieldsForm({ type: "object", properties: {}, required: ["missing"] }),
    ).toThrow(FormFieldsError)
  })
})
