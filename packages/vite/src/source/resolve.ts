import { join } from "node:path"
import { isRecord } from "@plainworks/std"
import { type KitCheckout, SOURCE_CONDITION } from "./checkout"
import { SourceLinkError } from "./errors"

const KIT_IMPORT = /^(@plainworks\/[^/]+)(\/.+)?$/
// Conditions a Vite app build matches, in the order this link prefers them.
const PREFERRED = [SOURCE_CONDITION, "import", "default"] as const

/**
 * The checkout file a kit import resolves to: the entry's `src` file when its export declares the
 * source condition, else its `dist` file (vendored entries, generated assets). Returns `undefined`
 * for an import of a package the checkout does not have. Throws a {@link SourceLinkError} for a
 * subpath the package does not export, so a typo never silently loads the installed copy.
 */
export function resolveKitImport(checkout: KitCheckout, specifier: string): string | undefined {
  const match = KIT_IMPORT.exec(specifier)
  if (match === null) return undefined
  const [, name = "", rest] = match
  const kit = checkout.packages.get(name)
  if (kit === undefined) return undefined
  const subpath = rest === undefined ? "." : `.${rest}`
  const target = exportTarget(kit.exports, subpath)
  const file = target === undefined ? undefined : pickFile(target)
  if (file === undefined) {
    throw new SourceLinkError(
      "vite/subpath-unknown",
      `${name} in ${kit.dir} does not export "${subpath}".`,
    )
  }
  return join(kit.dir, file)
}

function exportTarget(exports: unknown, subpath: string): unknown {
  if (typeof exports === "string" || Array.isArray(exports)) {
    return subpath === "." ? exports : undefined
  }
  if (!isRecord(exports)) return undefined
  const keys = Object.keys(exports)
  // A conditions-only map (no `.`-keys) describes the root entry.
  if (keys.length > 0 && keys.every((key) => !key.startsWith("."))) {
    return subpath === "." ? exports : undefined
  }
  return exports[subpath]
}

function pickFile(target: unknown): string | undefined {
  if (typeof target === "string") return target
  if (Array.isArray(target)) {
    for (const item of target) {
      const file = pickFile(item)
      if (file !== undefined) return file
    }
    return undefined
  }
  if (!isRecord(target)) return undefined
  for (const condition of PREFERRED) {
    if (condition in target) return pickFile(target[condition])
  }
  return undefined
}

/**
 * An exact-match alias for every stylesheet the checkout's packages export. CSS `@import`s (Vite's
 * own and Tailwind's) resolve through `config.createResolver`, which applies aliases but not plugin
 * `resolveId` hooks, so without these a source-linked app would still load the installed `dist` CSS
 * and scan it for classes.
 */
export function kitStylesheetAliases(
  checkout: KitCheckout,
): { readonly find: RegExp; readonly replacement: string }[] {
  const aliases: { find: RegExp; replacement: string }[] = []
  for (const kit of checkout.packages.values()) {
    if (!isRecord(kit.exports)) continue
    for (const subpath of Object.keys(kit.exports)) {
      if (!subpath.startsWith("./") || !subpath.endsWith(".css")) continue
      const specifier = `${kit.name}${subpath.slice(1)}`
      const replacement = resolveKitImport(checkout, specifier)
      if (replacement === undefined) continue
      aliases.push({ find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement })
    }
  }
  return aliases
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
