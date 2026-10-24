import { describe, expect, it } from "vitest"
import { fixSource, formatSource } from "./biome"

describe("formatSource", () => {
  it("reformats a source to the repo Biome style", () => {
    expect(formatSource("export const x = {a: 1};\n", "x.ts")).toBe("export const x = { a: 1 }\n")
  })

  it("keeps Biome's failure as the cause", () => {
    expect(() => formatSource("export const = ;\n", "broken.ts")).toThrow(
      expect.objectContaining({
        message: "Biome failed to format broken.ts",
        cause: expect.anything(),
      }),
    )
  })
})

describe("fixSource", () => {
  it("formats and applies safe fixes: sorted imports and type-only imports", () => {
    const source = [
      'import * as React from "react"',
      'import { b } from "b"',
      'import { a } from "a"',
      "export const x = (p: React.ComponentProps<'div'>) => [a, b, p]",
      "",
    ].join("\n")
    expect(fixSource(source, "src/shadcn/x.tsx")).toBe(
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
