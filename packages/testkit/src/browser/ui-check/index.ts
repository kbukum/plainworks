// `ui:check`: one command that captures an app's flows, reviews what changed against a base, and
// prints a verdict an agent can act on. Re-export-only barrel.
export type { AffectedFlows, AffectedFlowsOptions } from "./affected"
export { selectAffectedFlows } from "./affected"
export type { UiCheckArgs, UiCheckSelect } from "./args"
export { parseUiCheckArgs, UI_CHECK_USAGE } from "./args"
export type { BaseUse } from "./baselines"
export {
  baseCacheKey,
  DEFAULT_KEPT_BASES,
  evictBases,
  planBaseEviction,
  readStoredReport,
  recordBaseUse,
  saveSnapshot,
  uiCheckPaths,
} from "./baselines"
export type { BaseCapture, SuiteInvocation, UiCheckRuntime } from "./command"
export { runUiCheck, UI_CHECK_EXIT } from "./command"
export type { UiCheckConfig } from "./config"
export type { UiCheckErrorKind } from "./errors"
export { UiCheckError } from "./errors"
export type { GitRunner } from "./git"
export { changedFilesSince, mergeBaseWith, nodeGitRunner } from "./git"
export { compileGlob } from "./glob"
export type { PlaywrightMcpConfig, PlaywrightMcpOptions } from "./mcp"
export { playwrightMcpConfig, playwrightMcpInitPage } from "./mcp"
export { createNodeUiCheckRuntime, runUiCheckCli } from "./node-runtime"
