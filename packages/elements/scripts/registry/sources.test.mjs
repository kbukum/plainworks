import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { atomSources, OWNED_DIR, SHADCN_DIR } from "./sources.mjs"

const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function stageRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "pw-elements-sources-"))
  roots.push(root)
  mkdirSync(join(root, SHADCN_DIR), { recursive: true })
  mkdirSync(join(root, OWNED_DIR), { recursive: true })
  for (const path of files) writeFileSync(join(root, path), "export {}\n")
  return root
}

describe("atom sources", () => {
  it("lists shadcn and owned atoms together, sorted, and skips tests", () => {
    const root = stageRoot([
      `${SHADCN_DIR}/button.tsx`,
      `${SHADCN_DIR}/button.test.tsx`,
      `${OWNED_DIR}/sonner.tsx`,
      `${SHADCN_DIR}/alert.tsx`,
    ])
    expect(atomSources(root)).toEqual([
      { name: "alert", origin: "shadcn", path: `${SHADCN_DIR}/alert.tsx` },
      { name: "button", origin: "shadcn", path: `${SHADCN_DIR}/button.tsx` },
      { name: "sonner", origin: "owned", path: `${OWNED_DIR}/sonner.tsx` },
    ])
  })

  it("rejects an atom name that exists in both folders", () => {
    const root = stageRoot([`${SHADCN_DIR}/button.tsx`, `${OWNED_DIR}/button.tsx`])
    expect(() => atomSources(root)).toThrow(/"button" exists in both/)
  })
})
