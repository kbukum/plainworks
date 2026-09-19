// Per-atom accessibility corrections applied as part of materializing an owned atom from upstream.
// Some shadcn/Base-UI atoms ship an accessibility defect (an invalid ARIA role, a wrong element
// tag); because the pipeline reproduces every atom from upstream on `registry:update` — there is no
// patch file — a hand edit to the owned file would be silently overwritten. Encoding each fix as a
// declared, *asserted* rule here is what makes the correction durable: `registry:update` re-applies
// it, and if a future upstream release removes the pattern the rule targets, the assertion throws
// loudly instead of dropping the fix.
//
// Each rule runs against the formatted atom (after the cn/`"use client"` compat transform), so its
// `find` matches the repo's Biome layout. A rule replaces exactly one occurrence and throws when
// the expected upstream text is absent — never a silent no-op.

/**
 * @typedef {object} AccessibilityRule
 * @property {string} find The exact formatted upstream text this correction expects.
 * @property {string} replace The plainworks-correct replacement.
 * @property {string} reason Why the upstream markup is an accessibility defect.
 */

/** @type {Readonly<Record<string, ReadonlyArray<AccessibilityRule>>>} */
const ATOM_ACCESSIBILITY_FIXES = {
  breadcrumb: [
    {
      // The current page is static text, not a link: an interactive `role="link"` that cannot be
      // focused or activated is an invalid, disabled control. `aria-current="page"` alone announces
      // position within the trail.
      reason: "current breadcrumb page must not claim a non-interactive link role",
      find: '      data-slot="breadcrumb-page"\n      role="link"\n      aria-disabled="true"\n      aria-current="page"',
      replace: '      data-slot="breadcrumb-page"\n      aria-current="page"',
    },
    {
      // A breadcrumb link accepts arbitrary children, so an icon-only or single-character link can
      // fall below the WCAG 2.5.8 24x24 CSS px target. A min-size box with centered content
      // guarantees the target regardless of content width or height.
      reason: "breadcrumb link must meet the 24x24 CSS px target size for any content",
      find: '        className: cn("transition-colors hover:text-foreground", className),',
      replace:
        "        className: cn(\n" +
        '          "inline-flex min-h-6 min-w-6 items-center justify-center transition-colors hover:text-foreground",\n' +
        "          className,\n" +
        "        ),",
    },
  ],
  empty: [
    {
      // The declared props are paragraph props (`ComponentProps<"p">`), but upstream renders a
      // `div`, so the public type hands consumers the wrong element and drops paragraph semantics.
      reason: "EmptyDescription must render the paragraph element its props declare",
      find: '  return (\n    <div\n      data-slot="empty-description"',
      replace: '  return (\n    <p\n      data-slot="empty-description"',
    },
  ],
  item: [
    {
      // The paired default `Item` renders an unqualified container (and is used inside menus and
      // other non-list contexts), so a `role="list"` here exposes a list with no `listitem`
      // children — an invalid ARIA tree. Callers composing a true list opt into the roles.
      reason: "ItemGroup must not default to a list role its children do not satisfy",
      find: '    <div\n      role="list"\n      data-slot="item-group"',
      replace: '    <div\n      data-slot="item-group"',
    },
  ],
  kbd: [
    {
      // `KbdGroup` renders a `kbd` element, so a `ComponentProps<"div">` ref type can receive an
      // `HTMLElement` for a different tag at runtime; the public props must describe `kbd`.
      reason: "KbdGroup props must describe the kbd element it renders",
      find: 'function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {',
      replace: 'function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {',
    },
  ],
}

/**
 * Apply every declared accessibility correction for `name` to the materialized atom source. Atoms
 * without a correction pass through untouched. Each rule replaces exactly one occurrence and throws
 * if its expected upstream text is missing, so an upstream change that invalidates a fix fails the
 * ingest instead of silently regressing accessibility.
 *
 * @param {string} source The formatted atom source (post cn/`"use client"` transform).
 * @param {string} name The atom name, e.g. `"breadcrumb"`.
 * @returns {string} The source with all corrections for `name` applied.
 */
export function applyAccessibilityFixes(source, name) {
  const rules = ATOM_ACCESSIBILITY_FIXES[name]
  if (rules === undefined) return source
  let corrected = source
  for (const rule of rules) {
    if (!corrected.includes(rule.find)) {
      throw new Error(
        `accessibility fix for "${name}" (${rule.reason}) no longer matches upstream; ` +
          "review the atom and update the rule in scripts/registry/accessibility.mjs.",
      )
    }
    corrected = corrected.replace(rule.find, rule.replace)
  }
  return corrected
}
