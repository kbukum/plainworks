import { testConfig } from "@plainworks/vitest-config"

// `testing.ts` is the `./testing` entry, a re-export-only barrel like `index.ts`.
export default testConfig({ coverage: { exclude: ["src/testing.ts"] } })
