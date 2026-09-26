import { describe, expect, it } from "vitest"
import { isolateStylesheet } from "./isolate.mjs"

const S = "[data-plainworks-devtools]"
const SLOT = "[data-plainworks-devtools-slot]"
const OUT = `:not(:where(${SLOT} *))`

/** Normalize whitespace so assertions read like the CSS they describe. */
function flat(css) {
  return css.replace(/\s+/g, " ").trim()
}

describe("isolateStylesheet scoping", () => {
  it("scopes every selector in a list beneath the style root", () => {
    expect(flat(isolateStylesheet(".a, .b:hover > c { color: red }", S))).toBe(
      `${S} .a, ${S} .b:hover > c { color: red }`,
    )
  })

  it("leaves host-rendered slots to the host's styles without changing specificity", () => {
    expect(flat(isolateStylesheet(".a, .b > c { color: red }", S, { slot: SLOT }))).toBe(
      `${S} .a${OUT}, ${S} .b > c${OUT} { color: red }`,
    )
  })

  it("guards the element, not its pseudo-element, when excluding slots", () => {
    expect(flat(isolateStylesheet(".a::before, :after, .b:hover::placeholder { color: red }", S, { slot: SLOT }))).toBe(
      `${S} .a${OUT}::before, ${S} ${OUT}:after, ${S} .b:hover${OUT}::placeholder { color: red }`,
    )
  })

  it("lets theme tokens and the root's own rules reach into slots", () => {
    expect(flat(isolateStylesheet(".dark { --pw-bg: black } html { color: red }", S, { slot: SLOT }))).toBe(
      `.dark ${S} { --pw-bg: black } ${S} { color: red }`,
    )
  })

  it("keeps commas inside functional pseudo-classes within one selector", () => {
    expect(flat(isolateStylesheet(".a:is(.b, .c) { color: red }", S))).toBe(
      `${S} .a:is(.b, .c) { color: red }`,
    )
  })

  it("maps document-root selectors onto the style root itself", () => {
    expect(flat(isolateStylesheet("html, :host { line-height: 1.5 }", S))).toBe(
      `${S} { line-height: 1.5 }`,
    )
    expect(flat(isolateStylesheet("body { margin: 0 }", S))).toBe(`${S} { margin: 0 }`)
    expect(flat(isolateStylesheet(":root .x { color: red }", S))).toBe(`${S} .x { color: red }`)
  })

  it("scopes token-only rules as ancestor conditions so host modes cascade in", () => {
    expect(flat(isolateStylesheet(".dark { --pw-bg: black; color-scheme: dark }", S))).toBe(
      `.dark ${S} { --pw-bg: black; color-scheme: dark }`,
    )
    expect(flat(isolateStylesheet(':root { --pw-bg: white }', S))).toBe(`${S} { --pw-bg: white }`)
    expect(flat(isolateStylesheet(".dark { --foreground: var(--pw-foreground) }", S))).toBe(
      `.dark ${S} { --foreground: var(--pw-foreground) }`,
    )
    expect(flat(isolateStylesheet('[data-density="compact"] { --pw-gap: 1px }', S))).toBe(
      `[data-density="compact"] ${S} { --pw-gap: 1px }`,
    )
  })

  it("treats any rule with a styling declaration as descendant-scoped", () => {
    expect(flat(isolateStylesheet(".dark { --pw-bg: black; color: red }", S))).toBe(
      `${S} .dark { --pw-bg: black; color: red }`,
    )
    expect(flat(isolateStylesheet("* { --tw-x: initial }", S))).toBe(`${S} * { --tw-x: initial }`)
  })

  it("leaves selectors that already name the style root unchanged", () => {
    expect(flat(isolateStylesheet(`${S} { --marker: 1 }`, S))).toBe(`${S} { --marker: 1 }`)
  })

  it("scopes inside conditional at-rules and leaves keyframes and properties global", () => {
    const css = flat(
      isolateStylesheet(
        "@media (width < 48rem) { .a { color: red } } @keyframes spin { from { rotate: 0 } to { rotate: 1turn } } @property --tw-x { syntax: '*'; inherits: false }",
        S,
      ),
    )
    expect(css).toContain(`@media (width < 48rem) { ${S} .a { color: red } }`)
    expect(css).toContain("@keyframes spin { from { rotate: 0 } to { rotate: 1turn } }")
    expect(css).toContain("@property --tw-x")
  })

  it("namespaces keyframes and every animation reference so host keyframes cannot collide", () => {
    const css = flat(
      isolateStylesheet(
        ":root { --animate-spin: spin 1s linear infinite } .a { animation: var(--animate-spin) } .b { animation-name: spin, pulse } .c { animation: 1s spinner } @keyframes spin { to { rotate: 1turn } } @media print { @keyframes pulse { 50% { opacity: .5 } } }",
        S,
        { namespace: "pw" },
      ),
    )
    expect(css).toContain(`${S} { --animate-spin: pw-spin 1s linear infinite }`)
    expect(css).toContain(`${S} .a { animation: var(--animate-spin) }`)
    expect(css).toContain(`${S} .b { animation-name: pw-spin, pw-pulse }`)
    expect(css).toContain(`${S} .c { animation: 1s spinner }`)
    expect(css).toContain("@keyframes pw-spin { to { rotate: 1turn } }")
    expect(css).toContain("@keyframes pw-pulse")
    expect(css).not.toMatch(/@keyframes spin\b/)
  })

  it("namespaces registered custom properties and every reference so host variables keep theirs", () => {
    const css = flat(
      isolateStylesheet(
        "@property --tw-shadow { syntax: '*'; inherits: false; initial-value: 0 0 #0000 } .a { --tw-shadow: 0 1px red; box-shadow: var(--tw-ring, 0 0), var(--tw-shadow) } .b { --tw-shadow-color: red }",
        S,
        { namespace: "pw" },
      ),
    )
    expect(css).toContain("@property --pw-tw-shadow { syntax: '*'; inherits: false; initial-value: 0 0 #0000 }")
    expect(css).toContain(`${S} .a { --pw-tw-shadow: 0 1px red; box-shadow: var(--tw-ring, 0 0), var(--pw-tw-shadow) }`)
    // Only registered names are global; an unregistered, scoped declaration stays as written.
    expect(css).toContain(`${S} .b { --tw-shadow-color: red }`)
    expect(css).not.toContain("@property --tw-")
  })

  it("scopes only the outer rule of nested CSS", () => {
    expect(flat(isolateStylesheet(".a { &:hover { color: red } }", S))).toBe(
      `${S} .a { &:hover { color: red } }`,
    )
  })
})

describe("isolateStylesheet cascade layers", () => {
  it("unwraps layers in declared order, then the originally unlayered rules", () => {
    const css = flat(
      isolateStylesheet(
        "@layer theme, base, utilities; .u { color: red } @layer utilities { .x { color: blue } } @layer base { .b { color: green } } @layer theme { :root { --pw-a: 1 } }",
        S,
      ),
    )
    expect(css).not.toContain("@layer")
    const order = [`${S} { --pw-a: 1 }`, `${S} .b`, `${S} .x`, `${S} .u`].map((part) =>
      css.indexOf(part),
    )
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("orders layers by first mention when no statement declares them", () => {
    const css = flat(
      isolateStylesheet("@layer b { .b { color: red } } @layer a { .a { color: red } } @layer b { .c { color: red } }", S),
    )
    expect(css.indexOf(".b")).toBeLessThan(css.indexOf(".c"))
    expect(css.indexOf(".c")).toBeLessThan(css.indexOf(".a"))
  })

  it("flattens nested layers within their parent and keeps conditional rules", () => {
    const css = flat(
      isolateStylesheet(
        "@layer outer { @layer inner { .i { color: red } } .o { color: red } @media print { .p { color: red } } }",
        S,
      ),
    )
    expect(css.indexOf(".i")).toBeLessThan(css.indexOf(".o"))
    expect(css).toContain(`@media print { ${S} .p { color: red } }`)
  })

  it("rejects a layer nested in a conditional rule instead of guessing its order", () => {
    expect(() => isolateStylesheet("@media print { @layer x { .a { color: red } } }", S)).toThrow(
      /@layer inside @media/,
    )
  })
})
