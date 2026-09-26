// The build of the inspector's self-contained stylesheet: collect the utilities the shipped client
// uses, compile them with the kit's theme, then isolate the result beneath the style root and
// append the unscoped host contract. The output is plain CSS a host imports without Tailwind.

import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { Scanner } from "@tailwindcss/oxide"
import { Features, transform } from "lightningcss"
import { compile } from "tailwindcss"
import { isolateStylesheet } from "./isolate.mjs"

/** The style root every inspector rule is scoped beneath; the shell renders it. */
export const SCOPE = "[data-plainworks-devtools]"

/** Host-rendered regions inside the root (custom panels) that the host's own styles own. */
export const SLOT = "[data-plainworks-devtools-slot]"

/** Namespace for the stylesheet's document-global names (keyframes, registered properties). */
export const NAMESPACE = "plainworks-devtools"

// Tailwind v4's browser baseline, encoded as lightningcss version targets (major << 16 | minor << 8).
const TARGETS = { chrome: 111 << 16, safari: (16 << 16) | (4 << 8), firefox: 128 << 16 }

/**
 * The utility candidates found in bundled JavaScript, as Tailwind's own scanner extracts them.
 *
 * @param {string} code
 * @returns {string[]}
 */
export function collectCandidates(code) {
  return new Scanner({}).scanFiles([{ content: code, extension: "js" }])
}

/**
 * Compile `entry` for exactly `candidates`, isolate it, and append `hostContract`.
 *
 * @param {{ entry: string, hostContract: string, candidates: readonly string[] }} input
 * @returns {Promise<string>} Minified CSS.
 */
export async function buildStylesheet({ entry, hostContract, candidates }) {
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: dirname(entry),
    loadStylesheet: async (id, base) => {
      const path = resolveStylesheet(id, base)
      return { path, base: dirname(path), content: readFileSync(path, "utf8") }
    },
  })
  const compiled = compiler.build([...candidates])
  // Only flatten nesting before isolating: lowering for browser targets rewrites declarations
  // (e.g. `color-scheme` into helper properties), which would hide a token-only rule.
  const flat = lightning(compiled, { include: Features.Nesting, minify: false, targets: null })
  const isolated = isolateStylesheet(flat, SCOPE, { slot: SLOT, namespace: NAMESPACE })
  return lightning(`${isolated}\n${readFileSync(hostContract, "utf8")}`, { minify: true })
}

/**
 * @param {string} css
 * @param {{ include?: number, minify: boolean, targets?: typeof TARGETS | null }} options
 */
function lightning(css, { include = 0, minify, targets = TARGETS }) {
  const { code } = transform({
    filename: "styles.css",
    code: Buffer.from(css),
    targets: targets ?? undefined,
    include,
    minify,
  })
  return code.toString()
}

/**
 * Resolve a stylesheet `@import` the way a CSS-aware bundler does: relative paths from `base`,
 * bare specifiers through the package's `exports`, preferring the `style` condition.
 *
 * @param {string} id
 * @param {string} base
 * @returns {string}
 */
export function resolveStylesheet(id, base) {
  if (id.startsWith(".") || id.startsWith("/")) return resolve(base, id)
  const parts = id.split("/")
  const name = id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
  const subpath = `.${id.slice(name.length)}`
  const root = findPackage(name, base)
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const target = pickExport(manifest, subpath === "." ? "." : subpath)
  if (target === undefined) throw new Error(`No stylesheet export "${subpath}" in ${name}.`)
  return join(root, target)
}

/**
 * @param {string} name
 * @param {string} base
 */
function findPackage(name, base) {
  for (let dir = base; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name)
    if (existsSync(join(candidate, "package.json"))) return candidate
    if (dirname(dir) === dir) throw new Error(`Cannot resolve stylesheet package ${name}.`)
  }
}

/**
 * @param {{ exports?: unknown, style?: string }} manifest
 * @param {string} subpath
 * @returns {string | undefined}
 */
function pickExport(manifest, subpath) {
  const entry =
    typeof manifest.exports === "object" && manifest.exports !== null
      ? /** @type {Record<string, unknown>} */ (manifest.exports)[subpath]
      : undefined
  const target =
    typeof entry === "string"
      ? entry
      : typeof entry === "object" && entry !== null
        ? /** @type {Record<string, unknown>} */ (entry).style
        : undefined
  if (typeof target === "string") return target
  return subpath === "." ? manifest.style : undefined
}
