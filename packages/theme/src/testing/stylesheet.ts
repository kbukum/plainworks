import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Test-only reader for the package's stylesheets. It flattens CSS into leaf rules so a test can
 * assert what a selector declares and resolve the token values a given mode and scheme produce.
 */

/** One leaf rule and the at-rules (`@media …`, `@layer …`) that wrap it, outermost first. */
export interface CssRule {
  readonly selector: string
  readonly context: readonly string[]
  readonly declarations: ReadonlyMap<string, string>
}

/** The stylesheets the package ships. */
export type ShippedStylesheet = "tokens.css" | "styles.css"

/** Read a shipped stylesheet from source. */
export function readStylesheet(name: ShippedStylesheet): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", name), "utf8")
}

function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === "{") depth++
    if (text[index] === "}" && --depth === 0) return index
  }
  throw new Error(`Unbalanced brace at offset ${open}`)
}

function parseDeclarations(text: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const part of text.split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const name = part.slice(0, colon).trim()
    if (name === "" || name.startsWith("@")) continue
    declarations.set(
      name,
      part
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, " "),
    )
  }
  return declarations
}

function parseBlock(
  text: string,
  context: readonly string[],
  selector: string | undefined,
  out: CssRule[],
): void {
  const childContext = selector === undefined ? context : [...context, selector]
  let own = ""
  let segmentStart = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === ";") {
      own += text.slice(segmentStart, index + 1)
      segmentStart = index + 1
    } else if (char === "{") {
      const end = matchingBrace(text, index)
      const prelude = text.slice(segmentStart, index).trim().replace(/\s+/g, " ")
      parseBlock(text.slice(index + 1, end), childContext, prelude, out)
      index = end
      segmentStart = end + 1
    }
  }
  own += text.slice(segmentStart)
  const declarations = parseDeclarations(own)
  if (selector !== undefined && declarations.size > 0) {
    out.push({ selector, context, declarations })
  }
}

/** Flatten a stylesheet into leaf rules in source order. Comments are dropped. */
export function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  parseBlock(css.replace(/\/\*[\s\S]*?\*\//g, ""), [], undefined, rules)
  return rules
}

/** The rendering conditions a token lookup resolves against. */
export interface TokenConditions {
  readonly dark?: boolean
  readonly scheme?: string
  readonly media?: readonly string[]
}

function specificity(selector: string): number {
  return (selector.match(/[.:[]/g) ?? []).length
}

function matchingSelectors({ dark = false, scheme }: TokenConditions): Set<string> {
  const selectors = new Set([":root"])
  if (scheme !== undefined) selectors.add(`.theme-${scheme}`)
  if (dark) {
    selectors.add(".dark")
    if (scheme !== undefined) selectors.add(`.dark.theme-${scheme}`)
  }
  return selectors
}

/**
 * The custom properties the document root holds under the given conditions, with every `var()`
 * reference resolved. Rules apply by specificity, then source order, as the cascade does.
 */
export function resolveTokens(
  rules: readonly CssRule[],
  conditions: TokenConditions = {},
): Map<string, string> {
  const selectors = matchingSelectors(conditions)
  const media = new Set(conditions.media ?? [])
  const applicable = rules
    .map((rule, order) => ({ rule, order }))
    .filter(({ rule }) => selectors.has(rule.selector))
    .filter(({ rule }) => rule.context.every((at) => at.startsWith("@layer") || media.has(at)))
    .sort(
      (a, b) => specificity(a.rule.selector) - specificity(b.rule.selector) || a.order - b.order,
    )
  const raw = new Map<string, string>()
  for (const { rule } of applicable) {
    for (const [name, value] of rule.declarations) {
      if (name.startsWith("--")) raw.set(name, value)
    }
  }
  const resolve = (value: string, seen: ReadonlySet<string>): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      const next = raw.get(name)
      if (next === undefined || seen.has(name)) {
        throw new Error(`Unresolved custom property ${name}`)
      }
      return resolve(next, new Set([...seen, name]))
    })
  return new Map([...raw].map(([name, value]) => [name, resolve(value, new Set([name]))]))
}
