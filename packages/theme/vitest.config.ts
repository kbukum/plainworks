import { testConfig } from "@plainworks/vitest-config"

// `src/testing/` holds the stylesheet readers the tests share; it is test support, not shipped
// logic.
export default testConfig({ coverage: { exclude: ["src/testing/**"] } })
