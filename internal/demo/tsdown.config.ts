import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// Two entries: the demo-domain barrel (`.`) and the Node MSW server harness kept out of `.` because
// `msw/node` pulls in Node-only interceptors.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
  },
}

export default preset(build)
