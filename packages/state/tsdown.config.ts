import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `.` is the neutral core and `./client` the React bindings; both stay DOM-free. Each DOM scope
// backend is its own adapter subpath, named after the host store it binds.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "web-storage": "src/adapters/web-storage.ts",
    cookie: "src/adapters/cookie.ts",
    url: "src/adapters/url.ts",
  },
}

export default preset(build)
