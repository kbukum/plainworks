import { preset } from "@plainworks/tsdown-config"

// Four entries: the server-safe `.` framework barrel, the demo-domain barrel, plus the
// environment-bound surfaces kept out of `.` — the Node test server and the Vite dev middleware. (A
// browser worker entry returns once it can ship with real-browser e2e coverage; MSW's setupWorker
// cannot run under Node.)
export default preset({
  entry: {
    index: "src/index.ts",
    domain: "src/domain.ts",
    server: "src/server.ts",
    "vite-plugin": "src/vite-plugin.ts",
  },
})
