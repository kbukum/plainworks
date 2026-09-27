import { describe, expect, it } from "vitest"
import { syncLayerMapDocs } from "./docs"
import { parseLayerMap } from "./model"

const map = parseLayerMap({ layers: [{ packages: ["std"], summary: "Base." }] })
const block = (body: string) => `<!-- layer-map:table -->\n${body}\n<!-- /layer-map:table -->\n`

describe("syncLayerMapDocs", () => {
  it("reports each doc's current and synced text", () => {
    const files: Record<string, string> = { "a.md": block("stale"), "b.md": block("stale") }
    const docs = syncLayerMapDocs(map, (path) => files[path], ["a.md", "b.md"])
    expect(docs.map((doc) => doc.path)).toEqual(["a.md", "b.md"])
    expect(docs[0]?.current).toBe(block("stale"))
    expect(docs[0]?.synced).toContain("| **L0** | `std` | Base. |")
  })

  it("fails a listed doc that is missing or has no block", () => {
    expect(() => syncLayerMapDocs(map, () => undefined, ["gone.md"])).toThrow("gone.md is missing")
    expect(() => syncLayerMapDocs(map, () => "# no block\n", ["plain.md"])).toThrow(
      /plain\.md has no/,
    )
  })

  it("lists the README, the architecture doc, and the instructions by default", () => {
    const seen: string[] = []
    syncLayerMapDocs(map, (path) => {
      seen.push(path)
      return block("x")
    })
    expect(seen).toEqual(["README.md", "docs/architecture.md", ".github/copilot-instructions.md"])
  })
})
