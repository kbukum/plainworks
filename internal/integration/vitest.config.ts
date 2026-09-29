import { appTestConfig } from "@plainworks/vitest-config"

// Integration scenarios assemble the built, server-safe surfaces plus the msw/node mock service,
// so they run in Node against `dist`, one scenario per file under a concern folder in `src/`.
export default appTestConfig()
