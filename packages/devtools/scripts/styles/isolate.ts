// Isolation of a compiled Tailwind stylesheet beneath one style root, so the inspector carries its
// own styles into any host without touching the host's elements. Selector scoping guards outward
// only: host rules that target the inspector's light-DOM subtree can still apply.
//
// Two transforms run over the flattened (nesting-free) compiler output:
//
// - Layers are unwrapped in their cascade order. Unlayered host CSS beats every layered rule, so a
//   layered inspector would lose to a host's plain `button {}` rule. Emitting the layers' contents
//   in declared order, followed by the rules that were unlayered, keeps the kit's own cascade.
// - Every style rule is scoped beneath the root. Document-root selectors (`html`, `:root`, `:host`,
//   `body`) become the root itself. Rules that only set theme tokens (custom properties other than
//   Tailwind's per-element `--tw-*` internals, plus `color-scheme`) become ancestor conditions
//   (`.dark [root]`), so the host's mode, theme, and density classes on `<html>` still reach the
//   inspector. Every other rule becomes a descendant (`[root] .x`).
//
// Prefixing each selector adds the same specificity to every rule, so relative cascade order is
// unchanged. `@keyframes` and `@property` are not selectors, so they stay document-global.
// An optional namespace renames both so the host's own never collide with the inspector's: every
// keyframe name and its references (`animation`, `animation-name`, and theme tokens such as
// `--animate-spin`), and every registered custom property and its declarations and `var()`
// references (Tailwind's `--tw-*` registrations would otherwise change how a host's same-named
// variables inherit and initialize).
//
// An optional slot selector marks host-rendered content inside the root (custom panels). Element
// rules gain a zero-specificity `:not(:where(slot *))` guard so the host's own styles apply there;
// theme tokens and inherited properties still flow in from the root.

import postcss, { type ChildNode, type Container, type Root, type Rule } from "postcss"
import selectorParser from "postcss-selector-parser"

interface Scoping {
  scope: string
  guard: string | undefined
}

const ROOT_COMPOUND = /^(?::root|html|:host|body)(?![\w-])/
const KEYFRAMES_AT_RULES = new Set(["keyframes", "-webkit-keyframes"])
const NON_STYLE_AT_RULES = new Set([...KEYFRAMES_AT_RULES, "property", "font-face"])
const ANIMATION_PROPERTIES = new Set([
  "animation",
  "animation-name",
  "-webkit-animation",
  "-webkit-animation-name",
])
// Pseudo-elements CSS still accepts in single-colon form; lightningcss emits some that way.
const LEGACY_PSEUDO_ELEMENTS = new Set([":before", ":after", ":first-line", ":first-letter"])

/**
 * Scope `css` beneath the `scope` selector and unwrap its cascade layers.
 *
 * `scope` is the style-root selector, e.g. `[data-plainworks-devtools]`. `options.slot` names
 * host-rendered regions inside the root to leave unstyled. `options.namespace` prefixes the
 * document-global names the stylesheet defines: keyframes and registered custom properties.
 */
export function isolateStylesheet(
  css: string,
  scope: string,
  { slot, namespace }: { slot?: string; namespace?: string } = {},
): string {
  const root = postcss.parse(css)
  root.nodes = unwrapLayers(root.nodes)
  for (const node of root.nodes) node.parent = root
  scopeContainer(root, { scope, guard: slot === undefined ? undefined : `:not(:where(${slot} *))` })
  if (namespace !== undefined) {
    namespaceKeyframes(root, `${namespace}-`)
    namespaceRegisteredProperties(root, `--${namespace}-`)
  }
  return root.toString()
}

/**
 * Prefix every `@keyframes` name in `root` and each reference to it. References are matched as
 * whole identifiers in animation declarations and custom properties (Tailwind's `--animate-*`
 * tokens), so `spinner` or `var(--animate-spin)` are left alone.
 */
function namespaceKeyframes(root: Root, prefix: string): void {
  const names = new Set<string>()
  root.walkAtRules((rule) => {
    if (!KEYFRAMES_AT_RULES.has(rule.name)) return
    const name = rule.params.trim()
    names.add(name)
    rule.params = `${prefix}${name}`
  })
  if (names.size === 0) return
  root.walkDecls((decl) => {
    if (!ANIMATION_PROPERTIES.has(decl.prop) && !decl.prop.startsWith("--")) return
    decl.value = decl.value.replace(/[^\s,()]+/g, (token) =>
      names.has(token) ? `${prefix}${token}` : token,
    )
  })
}

/**
 * Rename every `@property`-registered custom property in `root` to `prefix` plus its name without
 * the leading dashes, along with each declaration of it and each reference in a value. Unregistered
 * custom properties are left alone: their declarations are already scoped beneath the root.
 *
 * `prefix` is e.g. `--plainworks-devtools-`.
 */
function namespaceRegisteredProperties(root: Root, prefix: string): void {
  const renamed = new Map<string, string>()
  root.walkAtRules("property", (rule) => {
    const name = rule.params.trim()
    const next = `${prefix}${name.slice(2)}`
    renamed.set(name, next)
    rule.params = next
  })
  if (renamed.size === 0) return
  root.walkDecls((decl) => {
    decl.prop = renamed.get(decl.prop) ?? decl.prop
    decl.value = decl.value.replace(/--[\w-]+/g, (token) => renamed.get(token) ?? token)
  })
}

/**
 * Replace every `@layer` in `nodes` with its contents, ordered by first mention of each layer and
 * followed by the unlayered nodes.
 */
function unwrapLayers(nodes: ChildNode[]): ChildNode[] {
  const layers = new Map<string, ChildNode[]>()
  const unlayered: ChildNode[] = []
  let anonymous = 0
  const layer = (name: string): ChildNode[] => {
    let contents = layers.get(name)
    if (contents === undefined) {
      contents = []
      layers.set(name, contents)
    }
    return contents
  }

  for (const node of nodes) {
    if (node.type === "atrule" && node.name === "layer") {
      if (node.nodes === undefined) {
        for (const name of postcss.list.comma(node.params)) layer(name)
        continue
      }
      const name = node.params.trim() || `\0anonymous-${anonymous++}`
      layer(name).push(...node.nodes)
      continue
    }
    rejectConditionalLayers(node)
    unlayered.push(node)
  }

  return [...[...layers.values()].flatMap((contents) => unwrapLayers(contents)), ...unlayered]
}

function rejectConditionalLayers(node: ChildNode): void {
  if (node.type !== "atrule" || node.nodes === undefined) return
  node.walkAtRules("layer", () => {
    throw new Error(
      `Unsupported @layer inside @${node.name}: its cascade order depends on the condition.`,
    )
  })
}

function scopeContainer(container: Container, scoping: Scoping): void {
  for (const node of container.nodes ?? []) {
    if (node.type === "rule") {
      node.selectors = scopeSelectors(node, scoping)
    } else if (node.type === "atrule" && !NON_STYLE_AT_RULES.has(node.name)) {
      scopeContainer(node, scoping)
    }
  }
}

function scopeSelectors(rule: Rule, { scope, guard }: Scoping): string[] {
  const ancestor = isTokenRule(rule)
  const descendant = (selector: string): string =>
    guard === undefined ? `${scope} ${selector}` : guardSubject(`${scope} ${selector}`, guard)
  const scoped = rule.selectors.map((selector) => {
    const trimmed = selector.trim()
    if (trimmed.startsWith(scope)) return trimmed
    const rootMatch = ROOT_COMPOUND.exec(trimmed)
    if (rootMatch !== null) {
      const rest = trimmed.slice(rootMatch[0]?.length ?? 0)
      if (rest === "") return scope
      // `:root .x` → `[root] .x`; `:root.dark` keeps its condition on the document root.
      return /^\s/.test(rest) ? descendant(rest.trim()) : `${trimmed} ${scope}`
    }
    return ancestor ? `${trimmed} ${scope}` : descendant(trimmed)
  })
  return [...new Set(scoped)]
}

/**
 * Append `guard` to the subject compound of `selector`, before any pseudo-element.
 */
function guardSubject(selector: string, guard: string): string {
  return selectorParser((selectors) => {
    selectors.each((complex) => {
      const nodes = complex.nodes
      let start = nodes.length
      while (start > 0 && nodes[start - 1]?.type !== "combinator") start -= 1
      const pseudoElement = nodes
        .slice(start)
        .find(
          (node) =>
            node.type === "pseudo" &&
            (node.value.startsWith("::") || LEGACY_PSEUDO_ELEMENTS.has(node.value)),
        )
      const guardNode = selectorParser.string({ value: guard })
      if (pseudoElement === undefined) complex.append(guardNode)
      else complex.insertBefore(pseudoElement, guardNode)
    })
  }).processSync(selector)
}

/**
 * A rule that only sets theme tokens: it describes a mode the host applies on an ancestor.
 */
function isTokenRule(rule: Rule): boolean {
  const nodes = rule.nodes.filter((node) => node.type !== "comment")
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.type === "decl" &&
        ((node.prop.startsWith("--") && !node.prop.startsWith("--tw-")) ||
          node.prop === "color-scheme"),
    )
  )
}
