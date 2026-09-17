import type { NextConfig } from "next"

// The second host's Next configuration. It stays intentionally lean: the app assembles the
// published @plainworks/* surfaces exactly as an external consumer would, so nothing here rewrites
// or special-cases the kit. React strict mode double-invokes effects in dev to surface the same
// teardown discipline (channel/stream/timer cleanup) the kit is built around.
const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
