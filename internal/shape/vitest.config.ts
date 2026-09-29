import { testConfig } from "@plainworks/vitest-config"

// `cli.ts` and `build-loader.ts` bind the real process and module loader; the command and the
// profile rules they drive are covered through in-memory workspaces.
// `src/testing` is the in-memory repository the tests share.
export default testConfig({
  coverage: { exclude: ["src/cli.ts", "src/build-loader.ts", "src/testing/**"] },
})
