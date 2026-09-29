import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { isRecord } from "@plainworks/std"
import { ShapeError } from "./error"
import type { ConfigLoader } from "./inspect"

/** Imports each workspace's `tsdown.config.ts` and `vitest.config.ts` from disk. */
export function moduleConfigLoader(repoRoot: string): ConfigLoader {
  return {
    build: async (dir) => {
      const config = await importConfig(repoRoot, dir, "tsdown.config.ts")
      if (config === undefined) return undefined
      if (!isRecord(config) || config.build === undefined) {
        throw new ShapeError(`${dir}: tsdown.config.ts exports no valid \`build\``)
      }
      return config.build
    },
    test: async (dir) => {
      const config = await importConfig(repoRoot, dir, "vitest.config.ts")
      return isRecord(config) ? config.default : undefined
    },
  }
}

async function importConfig(repoRoot: string, dir: string, file: string): Promise<unknown> {
  const path = join(repoRoot, dir, file)
  if (!existsSync(path)) return undefined
  try {
    return await import(pathToFileURL(path).href)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new ShapeError(`${dir}: ${file} failed to load (${reason})`, { cause })
  }
}
