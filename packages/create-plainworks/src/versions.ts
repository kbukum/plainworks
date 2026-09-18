import versions from "./versions.json"

// The concrete versions the initializer pins into every generated `package.json`. A standalone app
// cannot resolve `catalog:`/`workspace:` (those exist only inside the monorepo), so the manifest
// rewriter replaces each `catalog:` range from CATALOG_VERSIONS and each `workspace:`
// `@plainworks/*` range from PLAINWORKS_VERSIONS. The data lives in the generated `versions.json`
// (written by `bun run sync-versions`); `versions.test.ts` re-derives it from the catalog and
// package versions and fails on drift, so these maps are never stale.

/** Published `@plainworks/*` package -> pinned version. */
export const PLAINWORKS_VERSIONS: Record<string, string> = versions.plainworks

/** Third-party dependency -> the range pinned in the bun catalog. */
export const CATALOG_VERSIONS: Record<string, string> = versions.catalog
