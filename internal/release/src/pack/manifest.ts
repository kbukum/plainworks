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
  return `${JSON.stringify({ ...manifest, exports: publishedExports(manifest.exports) }, null, 2)}\n`
}

const CODE_TARGET = /\.(?:js|d\.ts)$/

// A copied asset exported as `{ source, default }` publishes as its plain `dist` path, as it did
// before the repo pointed the source condition at it. Code entries keep their condition object.
function publishedExports(exports: unknown): unknown {
  if (!isRecord(exports)) return withoutSource(exports)
  return Object.fromEntries(
    Object.entries(exports).map(([subpath, target]) => {
      const kept = withoutSource(target)
      const asset =
        isRecord(target) &&
        SOURCE_CONDITION in target &&
        isRecord(kept) &&
        Object.keys(kept).length === 1 &&
        typeof kept.default === "string" &&
        !CODE_TARGET.test(kept.default)
      return [subpath, asset ? kept.default : kept]
    }),
  )
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
    .filter(([, target]) => typeof target === "string" && !CODE_TARGET.test(target))
    .map(([subpath]) => subpath)
}

/** Whether the manifest declares any `exports`, i.e. an importable surface. */
export function hasExports(text: string): boolean {
  const manifest: unknown = JSON.parse(text)
  return isRecord(manifest) && manifest.exports !== undefined
}
