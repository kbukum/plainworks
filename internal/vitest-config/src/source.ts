import { defaultClientConditions, defaultServerConditions } from "vite"

/**
 * The export condition that maps a `@plainworks/*` entry to its `src` file. TypeScript
 * (`customConditions`), Vitest, and dependency-cruiser resolve it, so code in the repo reads live
 * source with no build. The release packs the manifest without it, so consumers only see `dist`.
 */
export const SOURCE_CONDITION = "@plainworks/source"

/** Vite's default conditions with the source condition in front, for both module graphs. */
export function sourceConditions(): {
  client: string[]
  server: string[]
} {
  return {
    client: [SOURCE_CONDITION, ...defaultClientConditions],
    server: [SOURCE_CONDITION, ...defaultServerConditions],
  }
}
