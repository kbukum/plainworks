// The deterministic plainworks compat transform applied to every atom the shadcn CLI emits, so an
// owned atom is plainworks-correct on arrival: it renders against the `@plainworks/theme` substrate
// that owns `cn`, and it is a `"use client"` module. `add` / `update` / `diff` all run the same
// transform, so the pipeline reproduces from upstream without a pristine snapshot to diff against —
// there is no patch file and no offline drift gate.

// base-nova ships `cn` as its own registry item imported as the bare specifier `cn`; the shadcn CLI
// may also emit the classic `@/lib/utils` bridge. Either way the substrate owns `cn`, so both
// forms rewrite onto `@plainworks/theme`.
const CN_IMPORT = /from\s+["'](?:cn|@\/lib\/utils)["']/g

// A leading `"use client"` directive, optionally terminated by a semicolon, as the very first
// token of the file. Directives are string literals only — never template literals.
const CLIENT_DIRECTIVE = /^\s*["']use client["'];?/

// Any other leading module directive (`"use server"`, `"use strict"`, …). Capture the name so an
// incompatible one can be reported verbatim.
const OTHER_DIRECTIVE = /^\s*["']use (\w+)["'];?/

/** Apply the full compat transform: rewrite the `cn` import, then guarantee `"use client"`. */
export function applyCompatTransform(source) {
  return ensureClientDirective(rewriteCnImport(source))
}

/** Point the shadcn `cn` import at the theme substrate that owns it. Idempotent. */
export function rewriteCnImport(source) {
  return source.replace(CN_IMPORT, 'from "@plainworks/theme"')
}

/**
 * Guarantee the file opens with `"use client"`. Atoms are DOM behaviour, so every one is a client
 * module; keeping the directive per-file (never on a barrel) is what lets tsdown emit each atom as
 * its own client entry. An existing `"use client"` is kept (idempotent), a compatible `"use
 * strict"` gains `"use client"` ahead of it, and any conflicting directive (e.g. `"use server"`)
 * is rejected — an atom cannot be both a client and a server module.
 */
export function ensureClientDirective(source) {
  if (CLIENT_DIRECTIVE.test(source)) return source
  const conflicting = OTHER_DIRECTIVE.exec(source)
  if (conflicting && conflicting[1] !== "strict") {
    throw new Error(
      `atom opens with an incompatible "use ${conflicting[1]}" directive; atoms must be client modules.`,
    )
  }
  return `"use client"\n\n${source.replace(/^\s+/, "")}`
}
