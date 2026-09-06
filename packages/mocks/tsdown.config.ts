import { preset } from "@plainworks/tsdown-config"

// Three entries: the server-safe `.` barrel plus the environment-bound surfaces kept out of it —
// the Node test server and the Vite dev middleware. (A browser worker entry returns once it can
// ship with real-browser e2e coverage; MSW's setupWorker cannot run under Node.)
export default preset({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    "vite-plugin": "src/vite-plugin.ts",
  },
})
