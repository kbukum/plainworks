#!/usr/bin/env node

// The `create-plainworks` executable entry point. The CLI orchestration is defined in
// `cli/execute.ts` behind an injectable seam, so this entry is a thin side-effect wrapper.

import { executeScaffold } from "./cli/execute"

const exitCode = await executeScaffold(process.argv.slice(2))
if (exitCode !== 0) {
  process.exitCode = exitCode
}
