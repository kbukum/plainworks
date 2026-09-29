import { isRecord } from "@plainworks/std"
/** A layer-map problem: an invalid `layers.json` or a malformed generated block in a doc. */
export class LayerMapError extends Error {
  override readonly name = "LayerMapError"
}

/** One layer: the packages in it, in display order, and what the layer is responsible for. */
export interface Layer {
  readonly packages: readonly string[]
  readonly summary: string
}

/** The package layer map. `layers[n]` is layer `Ln`. */
export interface LayerMap {
  readonly layers: readonly Layer[]
}

/**
 * Validates the parsed contents of `layers.json`.
 *
 * @throws {LayerMapError} When a layer is empty, a summary is missing, or a package repeats.
 */
export function parseLayerMap(value: unknown): LayerMap {
  const layers = isRecord(value) ? value.layers : undefined
  if (!Array.isArray(layers)) throw new LayerMapError("layers.json has no layers array")
  if (layers.length === 0) throw new LayerMapError("layers.json needs at least one layer")
  const seen = new Set<string>()
  const parsed = layers.map((entry: unknown, index): Layer => {
    const packages = isRecord(entry) ? entry.packages : undefined
    const summary = isRecord(entry) ? entry.summary : undefined
    if (!isNonEmptyStringArray(packages) || typeof summary !== "string" || summary.length === 0) {
      throw new LayerMapError(`L${index} needs a non-empty packages list and a summary`)
    }
    for (const pkg of packages) {
      if (seen.has(pkg)) throw new LayerMapError(`Package ${pkg} is listed in more than one layer`)
      seen.add(pkg)
    }
    return { packages, summary }
  })
  return { layers: parsed }
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")
}
