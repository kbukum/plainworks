import { describe, expect, it } from "vitest"
import { applyAccessibilityFixes } from "./accessibility.mjs"

// The rules run against the formatted atom, so each fixture mirrors the repo's Biome layout for the
// element the rule targets.
describe("atom accessibility corrections", () => {
  it("drops the non-interactive link role from the current breadcrumb page", () => {
    const upstream = [
      "    <span",
      '      data-slot="breadcrumb-page"',
      '      role="link"',
      '      aria-disabled="true"',
      '      aria-current="page"',
      "    />",
    ].join("\n")
    const fixed = applyAccessibilityFixes(upstream, "breadcrumb")
    expect(fixed).not.toContain('role="link"')
    expect(fixed).not.toContain('aria-disabled="true"')
    expect(fixed).toContain('aria-current="page"')
  })

  it("renders EmptyDescription as the paragraph its props declare", () => {
    const upstream = ["  return (", "    <div", '      data-slot="empty-description"', "    />"].join(
      "\n",
    )
    expect(applyAccessibilityFixes(upstream, "empty")).toContain('<p\n      data-slot="empty-description"')
  })

  it("removes the invalid default list role from ItemGroup", () => {
    const upstream = ["    <div", '      role="list"', '      data-slot="item-group"', "    />"].join(
      "\n",
    )
    const fixed = applyAccessibilityFixes(upstream, "item")
    expect(fixed).not.toContain('role="list"')
    expect(fixed).toContain('data-slot="item-group"')
  })

  it("types KbdGroup props as the kbd element it renders", () => {
    const upstream = 'function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {'
    expect(applyAccessibilityFixes(upstream, "kbd")).toContain('React.ComponentProps<"kbd">')
  })

  it("passes atoms without a declared correction through untouched", () => {
    const source = 'export function Button() {\n  return <button type="button" />\n}\n'
    expect(applyAccessibilityFixes(source, "button")).toBe(source)
  })

  it("throws loudly when upstream no longer matches a declared fix", () => {
    // A future upstream release that already dropped `role="list"` must fail the ingest, never
    // silently no-op — otherwise the correction's intent is lost with no signal.
    const drifted = ['    <div', '      data-slot="item-group"', "    />"].join("\n")
    expect(() => applyAccessibilityFixes(drifted, "item")).toThrow(/no longer matches upstream/)
  })
})
