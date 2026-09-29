import { testConfig } from "@plainworks/vitest-config"

// Security-load-bearing package, so it holds the higher floor. `server.ts` is the `./server`
// entry, a re-export-only barrel like `index.ts`.
export default testConfig({ coverage: { threshold: 85, exclude: ["src/server.ts"] } })
