import { preset } from "@plainworks/tsdown-config"

// Two entries: the server-safe `.` framework barrel and the Vite dev middleware kept out of `.`
// because it binds Node/Vite APIs. (A browser worker entry returns once it can ship with
// real-browser e2e coverage; MSW's setupWorker cannot run under Node.)
export default preset({
  entry: {
    index: "src/index.ts",
    "vite-plugin": "src/vite-plugin.ts",
  },
})
