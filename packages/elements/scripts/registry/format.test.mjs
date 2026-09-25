import { describe, expect, it } from "vitest"
import { fixTsx, formatSource } from "./format.mjs"

describe("formatSource", () => {
  it("reformats a source to the repo Biome style", () => {
    expect(formatSource("export const x = {a: 1};\n", "x.ts")).toBe("export const x = { a: 1 }\n")
  })
})

describe("fixTsx", () => {
  it("formats and applies safe fixes: sorted imports and type-only imports", () => {
    const source = [
      'import * as React from "react"',
      'import { b } from "b"',
      'import { a } from "a"',
      "export const x = (p: React.ComponentProps<'div'>) => [a, b, p]",
      "",
    ].join("\n")
    expect(fixTsx(source, "src/shadcn/x.tsx")).toBe(
      [
        'import { a } from "a"',
        'import { b } from "b"',
        'import type * as React from "react"',
        'export const x = (p: React.ComponentProps<"div">) => [a, b, p]',
        "",
      ].join("\n"),
    )
  })
})
