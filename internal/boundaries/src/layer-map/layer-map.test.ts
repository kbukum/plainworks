import { describe, expect, it } from "vitest"
import layers from "../../layers.json" with { type: "json" }
import { LayerMapError, parseLayerMap } from "./model"
import { renderLayerMapBlock } from "./render"
import { findLayerMapBlocks, syncLayerMapBlocks } from "./sync"

const map = parseLayerMap({
  layers: [
    { packages: ["std"], summary: "Base." },
    { packages: ["state", "http"], summary: "Middle." },
    { packages: ["app"], summary: "Top." },
  ],
})

describe("parseLayerMap", () => {
  it("rejects a malformed map", () => {
    expect(() => parseLayerMap({})).toThrow(LayerMapError)
    expect(() => parseLayerMap({ layers: [] })).toThrow(/at least one layer/)
    expect(() => parseLayerMap({ layers: [{ packages: [], summary: "x" }] })).toThrow(/L0/)
    expect(() => parseLayerMap({ layers: [{ packages: ["a"], summary: "" }] })).toThrow(/L0/)
    expect(() => parseLayerMap({ layers: [{ packages: [1], summary: "x" }] })).toThrow(/L0/)
  })

  it("rejects a package listed in two layers", () => {
    const twice = {
      layers: [
        { packages: ["a"], summary: "x" },
        { packages: ["a"], summary: "y" },
      ],
    }
    expect(() => parseLayerMap(twice)).toThrow("Package a is listed in more than one layer")
  })
})

describe("renderLayerMapBlock", () => {
  it("renders the dependency diagram top layer first", () => {
    expect(renderLayerMapBlock("diagram", map)).toBe(
      [
        "```mermaid",
        "flowchart TD",
        '  L2["L2 · app"] --> L1["L1 · state · http"]',
        '  L1 --> L0["L0 · std"]',
        "```",
        "",
        "*Arrows show the only allowed `@plainworks/*` import direction.*",
      ].join("\n"),
    )
  })

  it("renders a single-layer diagram as one node", () => {
    const single = parseLayerMap({ layers: [{ packages: ["std"], summary: "Base." }] })
    expect(renderLayerMapBlock("diagram", single)).toContain('  L0["L0 · std"]\n```')
  })

  it("renders the responsibility table bottom layer first", () => {
    expect(renderLayerMapBlock("table", map)).toBe(
      [
        "| Layer | Packages | Responsibility |",
        "|---|---|---|",
        "| **L0** | `std` | Base. |",
        "| **L1** | `state`, `http` | Middle. |",
        "| **L2** | `app` | Top. |",
      ].join("\n"),
    )
  })
})

const doc = (body: string) =>
  `# Title\n\nIntro.\n\n<!-- layer-map:table -->\n${body}\n<!-- /layer-map:table -->\n\nOutro.\n`

describe("syncLayerMapBlocks", () => {
  it("replaces only the text between the markers", () => {
    const synced = syncLayerMapBlocks(doc("stale"), map)
    expect(synced).toBe(doc(renderLayerMapBlock("table", map)))
    expect(syncLayerMapBlocks(synced, map)).toBe(synced)
  })

  it("syncs every block in a document", () => {
    const text = `<!-- layer-map:diagram -->\nold\n<!-- /layer-map:diagram -->\n\n${doc("old")}`
    const synced = syncLayerMapBlocks(text, map)
    expect(findLayerMapBlocks(synced).map((block) => block.kind)).toEqual(["diagram", "table"])
    expect(synced).toContain(renderLayerMapBlock("diagram", map))
    expect(synced).toContain(renderLayerMapBlock("table", map))
  })

  it("fails on an unknown kind, an unclosed block, or a stray end marker", () => {
    expect(() => findLayerMapBlocks("<!-- layer-map:list -->\n<!-- /layer-map:list -->")).toThrow(
      /Unknown layer-map block: list/,
    )
    expect(() => findLayerMapBlocks("<!-- layer-map:table -->\nx\n")).toThrow(/not closed/)
    expect(() => findLayerMapBlocks("x\n<!-- /layer-map:table -->")).toThrow(/without a start/)
    const crossed = "<!-- layer-map:table -->\n<!-- /layer-map:diagram -->"
    expect(() => findLayerMapBlocks(crossed)).toThrow(/not closed/)
  })
})

describe("layers.json", () => {
  it("is a valid layer map", () => {
    expect(parseLayerMap(layers).layers[0]?.packages).toEqual(["std"])
  })
})
