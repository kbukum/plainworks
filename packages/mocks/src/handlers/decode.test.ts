import { describe, expect, it } from "vitest"
import { decodeInput, type InputSpec } from "./decode"

interface DecodeInput {
  name: string
  age: number
  active: boolean
  role: "admin" | "user"
  tags: string[]
  items: { sku: string; qty: number }[]
}

const spec: InputSpec<DecodeInput> = {
  name: { kind: "string" },
  age: { kind: "number" },
  active: { kind: "boolean" },
  role: { kind: "enum", values: ["admin", "user"] },
  tags: { kind: "stringArray" },
  items: {
    kind: "objectArray",
    item: { sku: { kind: "string", required: true }, qty: { kind: "number" } },
  },
}

// A spec whose `kind` disagrees with the field's declared type must not compile.
// @ts-expect-error a number field rejects a string spec
const scalarMismatch: InputSpec<{ age: number }> = { age: { kind: "string" } }
// @ts-expect-error an object-array field rejects a scalar spec
const arrayMismatch: InputSpec<{ items: { sku: string }[] }> = { items: { kind: "string" } }
// @ts-expect-error a non-nullable field rejects a nullable spec
const nullableMismatch: InputSpec<{ notes: string }> = { notes: { kind: "string", nullable: true } }
void scalarMismatch
void arrayMismatch
void nullableMismatch

describe("decodeInput", () => {
  it("keeps only declared, well-typed fields and omits absent optionals", () => {
    const out = decodeInput(
      { name: "Ada", age: 42, role: "admin", tags: ["x"], unknown: "dropped" },
      spec,
    )
    expect(out).toEqual({ name: "Ada", age: 42, role: "admin", tags: ["x"] })
  })

  it("decodes nested object arrays against the item spec", () => {
    const out = decodeInput({ items: [{ sku: "A", qty: 2 }] }, spec)
    expect(out).toEqual({ items: [{ sku: "A", qty: 2 }] })
  })

  it("rejects a non-object body", () => {
    expect(decodeInput("nope", spec)).toBeNull()
    expect(decodeInput(null, spec)).toBeNull()
  })

  it("rejects a present field of the wrong type", () => {
    expect(decodeInput({ name: 5 }, spec)).toBeNull()
    expect(decodeInput({ age: Number.POSITIVE_INFINITY }, spec)).toBeNull()
    expect(decodeInput({ active: "yes" }, spec)).toBeNull()
    expect(decodeInput({ role: "root" }, spec)).toBeNull()
    expect(decodeInput({ tags: ["ok", 3] }, spec)).toBeNull()
    expect(decodeInput({ items: "not-array" }, spec)).toBeNull()
  })

  it("rejects an object-array entry missing a required field", () => {
    expect(decodeInput({ items: [{ qty: 1 }] }, spec)).toBeNull()
  })

  it("decodes null for nullable fields and rejects null for non-nullable fields", () => {
    const nullableSpec: InputSpec<{ bio: string | null; notes: string }> = {
      bio: { kind: "string", nullable: true },
      notes: { kind: "string" },
    }
    expect(decodeInput({ bio: null, notes: "hello" }, nullableSpec)).toEqual({
      bio: null,
      notes: "hello",
    })
    expect(decodeInput({ bio: "story", notes: null }, nullableSpec)).toBeNull()
  })
})
