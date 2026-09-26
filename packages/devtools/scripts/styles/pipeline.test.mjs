import { fileURLToPath } from "node:url"
import postcss from "postcss"
import { beforeAll, describe, expect, it } from "vitest"
import { buildStylesheet, collectCandidates, SCOPE, SLOT } from "./pipeline.mjs"

const entry = fileURLToPath(new URL("../../src/styles/inspector.css", import.meta.url))
const hostContract = fileURLToPath(new URL("../../src/styles/host-contract.css", import.meta.url))

describe("collectCandidates", () => {
  it("extracts utility candidates from bundled class strings", () => {
    const candidates = collectCandidates('cn("bg-popover px-2", open && "hover:bg-muted")')
    expect(candidates).toEqual(expect.arrayContaining(["bg-popover", "px-2", "hover:bg-muted"]))
  })
})

describe("buildStylesheet", () => {
  let css = ""

  beforeAll(async () => {
    css = await buildStylesheet({
      entry,
      hostContract,
      candidates: ["bg-popover", "hover:bg-muted", "dark:bg-muted", "md:px-4", "animate-spin"],
    })
  }, 60_000)

  it("compiles the requested utilities beneath the style root", () => {
    expect(css).toContain(`${SCOPE} .bg-popover:not(:where(${SLOT} *)){`)
    expect(css).toMatch(/\[data-plainworks-devtools\] \.hover\\:bg-muted:hover:not\(/)
  })

  it("ships plain CSS with no Tailwind directives, layers, or nesting", () => {
    for (const directive of ["@tailwind", "@apply", "@source", "@import", "@layer", "@theme", "&"]) {
      expect(css).not.toContain(directive)
    }
  })

  it("scopes every style rule except the host contract on the document root", () => {
    const unscoped = []
    postcss.parse(css).walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return
      for (const selector of rule.selectors) {
        const hostRule = selector.startsWith(":root")
        if (!selector.includes(SCOPE) && !hostRule) unscoped.push(selector)
        if (hostRule && !/^:root(\[data-plainworks-devtools-[\w-]+(="?\w+"?)?\])*$/.test(selector)) {
          unscoped.push(selector)
        }
      }
    })
    expect(unscoped).toEqual([])
  })

  it("lets the host's mode classes on ancestors reach the theme tokens", () => {
    const rules = []
    postcss.parse(css).walkRules((rule) => {
      if (rule.selectors.includes(`.dark ${SCOPE}`)) rules.push(rule.toString())
    })
    // The dark palette itself, with its color scheme, applies when `.dark` sits on an ancestor.
    expect(rules.some((rule) => rule.includes("--pw-background:") && rule.includes("dark"))).toBe(
      true,
    )
    expect(css).not.toMatch(/\.dark:not\(:where/)
  })

  it("registers no custom property under a name the host may use", () => {
    expect(css).toMatch(/@property --plainworks-devtools-tw-/)
    expect(css).not.toMatch(/@property --tw-/)
  })

  it("namespaces keyframes and keeps the production sentinel verbatim", () => {
    expect(css).toMatch(/@keyframes plainworks-devtools-spin\{/)
    expect(css).toContain("--animate-spin:plainworks-devtools-spin ")
    expect(css).not.toMatch(/@keyframes spin\{/)
    expect(css).toContain("--plainworks-devtools-present:1")
  })

  it("appends the host contract that reserves the docked chrome's space", () => {
    expect(css).toContain(":root[data-plainworks-devtools-reserve]")
    expect(css).toContain("--plainworks-devtools-inset-block-end")
  })
})
