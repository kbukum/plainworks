import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// The server-safe `.` framework barrel plus one subpath per concern. `lifecycle` and `vite-plugin`
// bind Node/Vite APIs, so they stay out of `.`. MSW's browser worker has no entry because
// setupWorker cannot run under Node.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    control: "src/control/index.ts",
    data: "src/data/common/index.ts",
    dispatch: "src/dispatch/index.ts",
    filter: "src/filter/index.ts",
    fixture: "src/fixture/index.ts",
    failure: "src/failure/index.ts",
    handlers: "src/handlers/common/index.ts",
    idp: "src/idp/index.ts",
    lifecycle: "src/lifecycle/index.ts",
    query: "src/query/index.ts",
    stream: "src/stream/index.ts",
    "vite-plugin": "src/vite-plugin.ts",
  },
}

export default preset(build)
