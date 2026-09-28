import type { NextConfig } from "next"

// The second host's Next configuration. It stays intentionally lean: the app assembles the
// published @plainworks/* surfaces exactly as an external consumer would, so nothing here rewrites
// or special-cases the kit. React strict mode double-invokes effects in dev to surface the same
// teardown discipline (channel/stream/timer cleanup) the kit is built around.
//
// `check-production` sets `PLAINWORKS_BUNDLE_ANALYSIS` for a separate analysis build: browser
// source maps let the exclusion gate read which modules each chunk bundled, and they land in their
// own output directory so the deployable `.next` never ships them.
const analysis = process.env.PLAINWORKS_BUNDLE_ANALYSIS === "1"
// The browser gate runs one `next dev` per worker, and Next allows one dev server per output
// directory, so each worker names its own.
const e2eDistDir = process.env.PLAINWORKS_E2E_DIST_DIR

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Plainworks inspector is this host's development tool. Next's own badge would cover the page
  // under every browser-gate check; build and runtime errors still open Next's overlay.
  devIndicators: false,
  ...(e2eDistDir === undefined ? {} : { distDir: e2eDistDir }),
  ...(analysis
    ? {
        distDir: ".bundle-analysis",
        productionBrowserSourceMaps: true,
        experimental: { serverSourceMaps: true },
      }
    : {}),
}

export default nextConfig
