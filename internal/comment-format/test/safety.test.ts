import { describe, expect, test } from "vitest"
import { codeUnchanged } from "../safety"

describe("safety oracle", () => {
  test("treats a comment-only change as code-unchanged", () => {
    const before = "// short\nconst a = 1\n"
    const after = "// a longer rewrapped comment\nconst a = 1\n"
    expect(codeUnchanged("sample.ts", before, after)).toBe(true)
  })

  test("detects an altered code token", () => {
    const before = "const a = 1\n"
    const after = "const a = 2\n"
    expect(codeUnchanged("sample.ts", before, after)).toBe(false)
  })

  test("detects a `//` injected into template-literal text", () => {
    const before = "const t = `both given`\n"
    const after = "const t = `both\n// given`\n"
    expect(codeUnchanged("sample.ts", before, after)).toBe(false)
  })

  test("ignores JSDoc rewrapping (JSDoc is not a code token)", () => {
    const before = "/** one line */\nexport const a = 1\n"
    const after = "/**\n * one line\n */\nexport const a = 1\n"
    expect(codeUnchanged("sample.ts", before, after)).toBe(true)
  })
})
