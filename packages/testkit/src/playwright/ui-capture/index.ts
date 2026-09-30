// `ui:capture`: one command that captures an app's flows as frames to look at, and, when asked,
// shows what changed against a base. Re-export-only barrel.
export type { AffectedFlows, AffectedFlowsOptions } from "./affected"
export { selectAffectedFlows } from "./affected"
export type { UiCaptureArgs, UiCaptureSelect } from "./args"
export { parseUiCaptureArgs, UI_CAPTURE_USAGE } from "./args"
export type { BaseUse } from "./baselines"
export {
  baseCacheKey,
  DEFAULT_KEPT_BASES,
  evictBases,
  planBaseEviction,
  readStoredReport,
  recordBaseUse,
  saveSnapshot,
  uiCapturePaths,
} from "./baselines"
export type { BaseCapture, SuiteInvocation, UiCaptureRuntime } from "./command"
export { runUiCapture, UI_CAPTURE_EXIT } from "./command"
export type { UiCaptureConfig } from "./config"
export type { DocsImage, PublishedDocsImages } from "./docs-images"
export { docsImagesOf, publishDocsImages } from "./docs-images"
export type { UiCaptureErrorKind } from "./errors"
export { UiCaptureError } from "./errors"
export type { GitRunner } from "./git"
export { changedFilesSince, mergeBaseWith, nodeGitRunner } from "./git"
export { compileGlob } from "./glob"
export type { PlaywrightMcpConfig, PlaywrightMcpOptions } from "./mcp"
export { playwrightMcpConfig, playwrightMcpInitPage } from "./mcp"
export { createNodeUiCaptureRuntime, runUiCaptureCli } from "./node-runtime"
