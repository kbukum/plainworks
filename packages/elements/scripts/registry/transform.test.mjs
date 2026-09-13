import { describe, expect, it } from "vitest"
import { applyCompatTransform, ensureClientDirective, rewriteCnImport } from "./transform.mjs"

describe("compat transform", () => {
  it("rewrites the bare base-nova `cn` specifier onto the theme substrate", () => {
    const out = rewriteCnImport('import { cn } from "cn"\n')
    expect(out).toBe('import { cn } from "@plainworks/theme"\n')
  })

  it("rewrites the classic `@/lib/utils` cn bridge onto the theme substrate", () => {
    const out = rewriteCnImport('import { cn } from "@/lib/utils"\n')
    expect(out).toBe('import { cn } from "@plainworks/theme"\n')
  })

  it("leaves sibling `@/atoms/*` imports untouched", () => {
    const source = 'import { Button } from "@/atoms/button"\n'
    expect(rewriteCnImport(source)).toBe(source)
  })

  it("prepends `use client` when the atom has no leading directive", () => {
    const out = ensureClientDirective('import * as React from "react"\n')
    expect(out).toBe('"use client"\n\nimport * as React from "react"\n')
  })

  it("is idempotent when the atom already opens with a directive", () => {
    const source = '"use client"\n\nimport * as React from "react"\n'
    expect(ensureClientDirective(source)).toBe(source)
  })

  it("rejects an incompatible `use server` directive instead of passing it through", () => {
    expect(() => ensureClientDirective('"use server"\n\nexport async function action() {}\n')).toThrow(
      'incompatible "use server" directive',
    )
  })

  it("prepends `use client` ahead of a compatible `use strict` directive", () => {
    const out = ensureClientDirective('"use strict";\nimport * as React from "react"\n')
    expect(out).toBe('"use client"\n\n"use strict";\nimport * as React from "react"\n')
  })

  it("ignores a directive that is not the first token", () => {
    const out = ensureClientDirective('// license\nimport * as React from "react"\n')
    expect(out.startsWith('"use client"')).toBe(true)
  })

  it("applies both steps for a representative upstream atom", () => {
    const upstream = ['import * as React from "react"', 'import { cn } from "cn"', ""].join("\n")
    const out = applyCompatTransform(upstream)
    expect(out).toBe(
      ['"use client"', "", 'import * as React from "react"', 'import { cn } from "@plainworks/theme"', ""].join(
        "\n",
      ),
    )
  })
})
