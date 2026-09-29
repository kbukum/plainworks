import { testConfig } from "@plainworks/vitest-config"

// `files.ts` binds the seam to the real disk; the in-memory double covers the same contract.
export default testConfig({ coverage: { exclude: ["src/files.ts"] } })
