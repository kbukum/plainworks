import { isRecord } from "@plainworks/std"
import { SOURCE_CONDITION } from "@plainworks/vitest-config"
import { ReleaseToolError } from "../error"

/**
 * The manifest a package publishes: its `package.json` text with the source condition removed from
 * `exports`, so consumers resolve only `dist`. A manifest without `exports` is returned unchanged.
 */
export function publishedManifest(text: string): string {
  const manifest: unknown = JSON.parse(text)
  if (!isRecord(manifest))
    throw new ReleaseToolError("The packed package.json is not a JSON object")
  if (manifest.exports === undefined) return text
  return `${JSON.stringify({ ...manifest, exports: withoutSource(manifest.exports) }, null, 2)}\n`
}

function withoutSource(target: unknown): unknown {
  if (Array.isArray(target)) return target.map(withoutSource)
  if (!isRecord(target)) return target
  return Object.fromEntries(
    Object.entries(target)
      .filter(([key]) => key !== SOURCE_CONDITION)
      .map(([key, value]) => [key, withoutSource(value)]),
  )
}

/** The subpaths of a manifest's non-JS exports, such as `./styles.css`. */
export function assetSubpaths(text: string): string[] {
  const manifest: unknown = JSON.parse(text)
  if (!isRecord(manifest) || !isRecord(manifest.exports)) return []
  return Object.entries(manifest.exports)
    .filter(([, target]) => typeof target === "string" && !/\.(?:js|d\.ts)$/.test(target))
    .map(([subpath]) => subpath)
}

/** Whether the manifest declares any `exports`, i.e. an importable surface. */
export function hasExports(text: string): boolean {
  const manifest: unknown = JSON.parse(text)
  return isRecord(manifest) && manifest.exports !== undefined
}
