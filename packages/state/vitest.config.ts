import { testConfig } from "@plainworks/vitest-config"

// `client/supplied.ts` is the `./client/supplied` entry, a re-export-only barrel like `index.ts`.
export default testConfig({ coverage: { exclude: ["src/client/supplied.ts"] } })
