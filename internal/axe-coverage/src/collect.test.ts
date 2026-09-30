import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { collectRenderTests } from "./collect"

const scratch = join(import.meta.dirname, "collect-scratch")

function write(...segments: string[]): void {
  const path = join(scratch, ...segments)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, "")
}

describe("collectRenderTests", () => {
  beforeEach(() => {
    rmSync(scratch, { recursive: true, force: true })
    write("src", "button.test.tsx")
    write("src", "button.tsx")
    write("src", "model.test.ts")
    write("node_modules", "dep", "x.test.tsx")
    write(".next", "types", "y.test.tsx")
    write("fixtures", "z.test.tsx")
  })

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it("collects only authored `.test.tsx` files", () => {
    expect(collectRenderTests(scratch)).toEqual([join(scratch, "src", "button.test.tsx")])
  })
})
