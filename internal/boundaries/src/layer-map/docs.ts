import { type LayerMap, LayerMapError } from "./model"
import { findLayerMapBlocks, syncLayerMapBlocks } from "./sync"

/** The repo-relative docs that embed generated layer-map blocks. */
export const LAYER_MAP_DOCS: readonly string[] = [
  "README.md",
  "docs/architecture.md",
  ".github/copilot-instructions.md",
]

/** One doc's current text and the text it should have. */
export interface LayerMapDoc {
  readonly path: string
  readonly current: string
  readonly synced: string
}

/**
 * Renders every doc from the layer map. A listed doc that is missing or embeds no block fails, so
 * a deleted marker cannot turn the check vacuously green.
 *
 * @throws {LayerMapError} When a doc is missing, has no block, or has a malformed block.
 */
export function syncLayerMapDocs(
  map: LayerMap,
  readText: (path: string) => string | undefined,
  docs: readonly string[] = LAYER_MAP_DOCS,
): LayerMapDoc[] {
  return docs.map((path) => {
    const current = readText(path)
    if (current === undefined) throw new LayerMapError(`${path} is missing`)
    if (findLayerMapBlocks(current).length === 0) {
      throw new LayerMapError(`${path} has no <!-- layer-map:… --> block`)
    }
    return { path, current, synced: syncLayerMapBlocks(current, map) }
  })
}
