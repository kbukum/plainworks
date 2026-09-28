import { type LayerMap, LayerMapError } from "./model"
import { LAYER_MAP_BLOCK_KINDS, type LayerMapBlockKind, renderLayerMapBlock } from "./render"

/** A generated block found in a doc: its kind and the character range of its body. */
export interface LayerMapBlock {
  readonly kind: LayerMapBlockKind
  /** Offset just after the start marker's line break. */
  readonly bodyStart: number
  /** Offset of the end marker. */
  readonly bodyEnd: number
}

const MARKER = /<!-- (\/?)layer-map:([a-z-]+) -->/g

/**
 * Finds every `<!-- layer-map:<kind> -->` … `<!-- /layer-map:<kind> -->` block in a doc.
 *
 * @throws {LayerMapError} On an unknown kind, an unclosed block, or a stray end marker.
 */
export function findLayerMapBlocks(text: string): LayerMapBlock[] {
  const blocks: LayerMapBlock[] = []
  let open: { kind: LayerMapBlockKind; bodyStart: number } | undefined
  for (const match of text.matchAll(MARKER)) {
    const [marker, slash, name = ""] = match
    const kind = LAYER_MAP_BLOCK_KINDS.find((known) => known === name)
    if (kind === undefined) throw new LayerMapError(`Unknown layer-map block: ${name}`)
    if (slash === "") {
      if (open !== undefined) throw new LayerMapError(`layer-map:${open.kind} is not closed`)
      open = { kind, bodyStart: match.index + marker.length + 1 }
    } else if (open === undefined) {
      throw new LayerMapError(`/layer-map:${kind} appears without a start marker`)
    } else if (open.kind !== kind) {
      throw new LayerMapError(`layer-map:${open.kind} is not closed`)
    } else {
      blocks.push({ kind, bodyStart: open.bodyStart, bodyEnd: match.index })
      open = undefined
    }
  }
  if (open !== undefined) throw new LayerMapError(`layer-map:${open.kind} is not closed`)
  return blocks
}

/** Rewrites every generated block in a doc from the layer map; other text is left untouched. */
export function syncLayerMapBlocks(text: string, map: LayerMap): string {
  let synced = ""
  let cursor = 0
  for (const block of findLayerMapBlocks(text)) {
    synced += `${text.slice(cursor, block.bodyStart)}${renderLayerMapBlock(block.kind, map)}\n`
    cursor = block.bodyEnd
  }
  return synced + text.slice(cursor)
}
