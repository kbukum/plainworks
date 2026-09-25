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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(analysis
    ? {
        distDir: ".bundle-analysis",
        productionBrowserSourceMaps: true,
        experimental: { serverSourceMaps: true },
      }
    : {}),
}

export default nextConfig
