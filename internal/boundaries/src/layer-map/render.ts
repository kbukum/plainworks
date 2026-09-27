import type { LayerMap } from "./model"

/** The generated block kinds a doc can embed. */
export const LAYER_MAP_BLOCK_KINDS = ["diagram", "table"] as const

/** A generated block kind: the dependency `diagram` or the responsibility `table`. */
export type LayerMapBlockKind = (typeof LAYER_MAP_BLOCK_KINDS)[number]

/** Renders one generated block's Markdown, without its markers. */
export function renderLayerMapBlock(kind: LayerMapBlockKind, map: LayerMap): string {
  return kind === "diagram" ? renderDiagram(map) : renderTable(map)
}

function renderDiagram({ layers }: LayerMap): string {
  const node = (index: number) =>
    `L${index}["${[`L${index}`, ...(layers[index]?.packages ?? [])].join(" · ")}"]`
  const top = layers.length - 1
  const edges =
    top === 0
      ? [`  ${node(0)}`]
      : Array.from({ length: top }, (_, step) => {
          const from = top - step
          return `  ${from === top ? node(from) : `L${from}`} --> ${node(from - 1)}`
        })
  return [
    "```mermaid",
    "flowchart TD",
    ...edges,
    "```",
    "",
    "*Arrows show the only allowed `@plainworks/*` import direction.*",
  ].join("\n")
}

function renderTable({ layers }: LayerMap): string {
  const rows = layers.map(({ packages, summary }, index) => {
    const names = packages.map((pkg) => `\`${pkg}\``).join(", ")
    return `| **L${index}** | ${names} | ${summary} |`
  })
  return ["| Layer | Packages | Responsibility |", "|---|---|---|", ...rows].join("\n")
}
