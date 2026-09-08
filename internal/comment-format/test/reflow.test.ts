import { describe, expect, test } from "vitest"
import { MAX_WIDTH, reflowSource } from "../reflow"

const run = (source: string): string => reflowSource("sample.ts", source)

/** Every physical line of `source` fits the width (comment or not). */
function withinWidth(source: string): boolean {
  return source.split("\n").every((line) => line.length <= MAX_WIDTH)
}

describe("line comments", () => {
  test("wraps an over-width own-line comment to the print width, preserving indentation", () => {
    const src = `  // ${"word ".repeat(30).trim()}\n  const a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toMatch(/^ {2}\/\/ /m)
    expect(out.endsWith("  const a = 1\n")).toBe(true)
  })

  test("never merges two separate adjacent line comments", () => {
    const src = `// first comment that is short\n// second comment that is short\nconst a = 1\n`
    expect(run(src)).toBe(src)
  })

  test("leaves a trailing comment after code untouched (cannot be safely wrapped)", () => {
    const src = `const value = compute() // ${"trailing ".repeat(20).trim()}\n`
    expect(run(src)).toBe(src)
  })

  test("leaves directive comments untouched", () => {
    const src = `// biome-ignore lint/suspicious/noExplicitAny: ${"x".repeat(120)} needed here for the seam\nconst a: any = 1\n`
    expect(run(src)).toBe(src)
  })

  test("leaves a bare over-width token (a URL) on its own line rather than splitting it", () => {
    const url = `https://example.com/${"a".repeat(120)}`
    const src = `// ${url}\nconst a = 1\n`
    expect(run(src)).toBe(src)
  })
})

describe("parser safety", () => {
  test("never touches a `//` sequence inside a string literal", () => {
    const url = `http://example.com/${"a".repeat(120)}`
    const src = `const u = "${url}"\n`
    expect(run(src)).toBe(src)
  })

  test("never touches a `/*` sequence inside a template literal", () => {
    const src = `const t = \`/* ${"not a comment ".repeat(20)} */\`\n`
    expect(run(src)).toBe(src)
  })
})

describe("TSDoc blocks", () => {
  test("wraps an over-width description while keeping it a description", () => {
    const src = `/**\n * ${"long description ".repeat(12).trim()}\n */\nexport const a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toMatch(/^\/\*\*$/m)
  })

  test("does NOT merge tight (blank-line-less) list bullets — the plugin's failure mode", () => {
    const src = [
      "/**",
      " * Invariants:",
      " *",
      ` * - First bullet ${"that runs long ".repeat(8).trim()} to the end.`,
      ` * - Second bullet ${"also quite long ".repeat(8).trim()} here.`,
      " */",
      "export const a = 1",
      "",
    ].join("\n")
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    const bullets = out.split("\n").filter((l) => /^ \* - /.test(l))
    expect(bullets).toHaveLength(2)
    expect(out).not.toMatch(/result\. - /)
    expect(out).not.toMatch(/end\. - Second/)
  })

  test("keeps {@link ...} atomic across a wrap boundary", () => {
    const src = `/**\n * ${"padding ".repeat(11).trim()} {@link SomeVeryLongSymbolName} tail.\n */\nexport const a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toContain("{@link SomeVeryLongSymbolName}")
  })

  test("leaves fenced code inside a block verbatim", () => {
    const code = `const q = ${"veryLongIdentifierName".repeat(4)}`
    const src = [
      `/**`,
      ` * Example:`,
      ` *`,
      " * ```ts",
      ` * ${code}`,
      " * ```",
      ` */`,
      `export const a = 1`,
      "",
    ].join("\n")
    const out = run(src)
    expect(out).toContain(` * ${code}`)
  })

  test("wraps an @param tag with hanging indent", () => {
    const src = `/**\n * Do it.\n * @param signal ${"the abort signal ".repeat(8).trim()} used here.\n */\nexport const a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toMatch(/^ \* @param signal /m)
    expect(out).toMatch(/^ \* {3}\S/m) // continuation is hung under the tag
  })
})

describe("regression: template literals and inline code", () => {
  test("ignores a `//` sequence inside a template literal with dollar-brace substitutions", () => {
    const long = "x".repeat(120)
    const src = `const t = \`\${a} // ${long} not a comment\`\nconst b = 1\n`
    expect(run(src)).toBe(src)
  })

  test("ignores a `/*` sequence inside a template tail after a substitution", () => {
    const long = "y".repeat(120)
    const src = `const t = \`head \${a} /* ${long} */ tail\`\nconst b = 1\n`
    expect(run(src)).toBe(src)
  })

  test("never injects a space between inline code and adjacent punctuation", () => {
    const src = `// The \`__Host-\`-prefixed cookie name ${"padding ".repeat(12).trim()} tail.\nconst a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toContain("`__Host-`-prefixed")
    expect(out).not.toContain("`__Host-` -prefixed")
  })

  test("wraps an over-width `//` comment carrying multiple backtick spans without corruption", () => {
    const src = `// Keys normalize so \`x-api-key\`, \`api_key\`, and \`apikey\` ${"all collapse ".repeat(6).trim()} here.\nconst a = 1\n`
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(out).toContain("`x-api-key`,")
    expect(out).toContain("`api_key`,")
    expect(out).toContain("`apikey`")
  })
})

describe("sentence-aware wrapping", () => {
  const lineAfter = (out: string, needle: string): string | undefined =>
    out.split("\n").find((l) => l.includes(needle))

  test("breaks before a new sentence when its boundary sits within the window of the margin", () => {
    // The first sentence fills the line to near the margin, so the second sentence starts fresh.
    const src =
      "// Integration tests assemble the neutral, server-safe surfaces plus the msw mock service now. Concern folders live directly under the package here for sure.\nconst a = 1\n"
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    // The line ending the first sentence must not carry the start of the next one.
    const boundaryLine = lineAfter(out, "mock service now.")
    expect(boundaryLine).toBeDefined()
    expect(boundaryLine).not.toContain("Concern")
    expect(out).toMatch(/^\/\/ Concern folders/m)
  })

  test("does NOT pull back to a sentence boundary that is far from the margin (stays greedy)", () => {
    const src =
      "// Short. This is a single long continuing sentence that just keeps going well past the hundred column mark for sure here.\nconst a = 1\n"
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    // `Short.` is far from the margin, so the greedy line keeps filling past it.
    expect(out).toMatch(/^\/\/ Short\. This is a single long/m)
  })

  test("never breaks after an abbreviation like `e.g.`", () => {
    const src =
      "// This picks a resilience strategy, e.g. Foo and also Bar, to keep the retry backoff bounded here.\nconst a = 1\n"
    const out = run(src)
    expect(withinWidth(out)).toBe(true)
    expect(lineAfter(out, "e.g.")).toContain("e.g. Foo")
  })
})

describe("stability", () => {
  test("is a fixed point: reflowing reflowed output is a no-op", () => {
    const src = [
      "  // " + "word ".repeat(30).trim(),
      "  const a = 1",
      "/**",
      " * " + "long description ".repeat(12).trim(),
      " *",
      " * - bullet " + "one ".repeat(20).trim(),
      " * - bullet " + "two ".repeat(20).trim(),
      " */",
      "export const b = 2",
      "",
    ].join("\n")
    const once = run(src)
    expect(run(once)).toBe(once)
  })
})
