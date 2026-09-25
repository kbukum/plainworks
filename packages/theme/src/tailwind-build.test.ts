import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { compile } from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"

// Compile the shipped stylesheet with the real Tailwind v4 compiler, as a consumer's build would.
const require = createRequire(import.meta.url)
const entry = fileURLToPath(new URL("./styles.css", import.meta.url))
const tailwindEntry = require.resolve("tailwindcss/index.css")
const animateEntry = fileURLToPath(
  new URL("../node_modules/tw-animate-css/dist/tw-animate.css", import.meta.url),
)

function locate(id: string, base: string): string {
  if (id === "tailwindcss") return tailwindEntry
  if (id === "tw-animate-css") return animateEntry
  return resolve(base, id)
}

async function build(candidates: readonly string[]): Promise<string> {
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: dirname(entry),
    loadStylesheet: async (id, base) => {
      const path = locate(id, base)
      return { path, base: dirname(path), content: readFileSync(path, "utf8") }
    },
  })
  return compiler.build([...candidates])
}

function rule(css: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return css.match(new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
}

describe("styles.css under a Tailwind v4 build", () => {
  let css = ""

  beforeAll(async () => {
    css = await build([
      "border",
      "bg-success",
      "text-warning-foreground",
      "rounded-lg",
      "font-mono",
      "text-heading",
      "h-control",
      "gap-stack",
      "p-inset",
      "shadow-overlay",
      "z-toast",
      "transition",
      "duration-fast",
      "ease-enter",
    ])
  })

  it("emits the plain token layer, including the semantic border default", () => {
    expect(css).toContain("--pw-background:")
    expect(css).toMatch(/border-color:\s*var\(--pw-border\)/)
  })

  it("keeps the kit's base rules after Tailwind's preflight so they win", () => {
    expect(css.lastIndexOf("border-color: var(--pw-border)")).toBeGreaterThan(
      css.indexOf("border: 0 solid"),
    )
  })

  it("resolves every token utility to the runtime custom property", () => {
    const expectations: [string, RegExp][] = [
      ["bg-success", /background-color:\s*var\(--pw-success\)/],
      ["text-warning-foreground", /color:\s*var\(--pw-warning-foreground\)/],
      ["rounded-lg", /border-radius:\s*var\(--pw-radius\)/],
      ["font-mono", /font-family:\s*var\(--pw-font-mono\)/],
      ["text-heading", /font-size:\s*var\(--pw-text-heading\)/],
      ["h-control", /height:\s*var\(--pw-space-control\)/],
      ["gap-stack", /gap:\s*var\(--pw-space-stack\)/],
      ["p-inset", /padding:\s*var\(--pw-space-inset\)/],
      ["shadow-overlay", /var\(--pw-shadow-overlay\)/],
      ["z-toast", /z-index:\s*var\(--pw-z-toast\)/],
      ["transition", /var\(--pw-duration-base\)/],
      ["duration-fast", /transition-duration:\s*var\(--pw-duration-fast\)/],
      ["ease-enter", /var\(--pw-ease-enter\)/],
    ]
    for (const [className, pattern] of expectations) {
      expect(rule(css, className), className).toMatch(pattern)
    }
  })
})
