/**
 * The Playwright image `.github/workflows/ci.yml` runs the browser gate in. Keep the two digests
 * identical so baselines written here match CI pixel for pixel.
 */
export const PLAYWRIGHT_IMAGE =
  "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27"

/** The bun version installed inside the container; matches the repo's `packageManager`. */
export const BUN_VERSION = "1.3.6"

/** The apps that carry `@visual` Playwright baselines. */
export const VISUAL_APPS: readonly string[] = ["showcase", "next-host"]

/** The CI runner's architecture, emulated unless `E2E_LINUX_PLATFORM` names another. */
export const DEFAULT_PLATFORM = "linux/amd64"
