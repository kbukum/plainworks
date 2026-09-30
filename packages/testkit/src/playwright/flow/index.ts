// The flow engine: named journeys replayed once per device, checked and captured at every
// checkpoint across the page variants of a matrix. Re-export-only barrel.
export type { CheckpointChecks, Flow, FlowActionContext, FlowCheckpoint } from "./definition"
export { defineFlow } from "./definition"
export type { DeviceRunOptions, FlowTimeouts } from "./device-run"
export { DEFAULT_FLOW_TIMEOUTS, runFlowOnDevice } from "./device-run"
export type { FlowErrorKind } from "./errors"
export { FLOW_ERROR_KINDS, FlowError } from "./errors"
export type { VisualCapture } from "./frame"
export type {
  DeviceContextOptions,
  DeviceId,
  DevicePlan,
  DeviceProfile,
  FlowMode,
  MatrixPresetName,
  MatrixSpec,
  PageVariant,
  PreferenceEmulation,
  PreferenceId,
  ThemeAxes,
  ThemeAxisSelection,
  ThemeRoot,
  ViewportSize,
} from "./matrix"
export {
  DEFAULT_MATRIX_PRESET,
  DEVICE_IDS,
  DEVICE_PROFILES,
  defineThemeAxes,
  deviceContextOptions,
  expandFlowMatrix,
  FLOW_MODES,
  MATRIX_PRESETS,
  MODE_ONLY_THEME_AXES,
  PREFERENCE_IDS,
  PREFERENCES,
  pageVariant,
  samplePairwise,
} from "./matrix"
export { flowOutcomeError } from "./outcome"
export type { PageFlowSession, PageFlowSessionOptions } from "./page-session"
export { createPageFlowSession } from "./page-session"
export type { FlowPlanOptions, PlannedFlowRun } from "./plan"
export { planFlowRuns } from "./plan"
export type {
  ArtifactStore,
  ChangeReview,
  ChangeStatus,
  ChangeTotals,
  CheckpointLocation,
  CheckpointReport,
  ContactSheets,
  EvidenceLinks,
  FlowDeviceReport,
  FlowReport,
  FlowReportSummary,
  FlowRun,
  FlowRunMode,
  FlowRunWriter,
  FlowSelection,
  FlowStatus,
  FrameChange,
  MemoryArtifactStore,
  ReportedError,
  RetentionPolicy,
  ReviewBase,
  SelectedFlow,
  StoredRun,
  VariantReport,
} from "./report"
export {
  collectFlowRun,
  DEFAULT_RETENTION,
  describeChangeTotals,
  FLOW_REPORT_SCHEMA_VERSION,
  FLOW_RUN_ENV,
  flowArtifactPaths,
  memoryArtifactStore,
  nodeArtifactStore,
  openFlowRun,
  parseFlowDeviceReport,
  parseFlowReport,
  planRunRetention,
  publishFlowRun,
  renderFlowReportMarkdown,
  startFlowRun,
  summarizeFlowRuns,
} from "./report"
export type { SetupFlowRunOptions } from "./run-setup"
export { setupFlowRun } from "./run-setup"
export type { FlowFixtures, RunFlowOptions } from "./runner"
export { runFlow } from "./runner"
export type { EvidenceSnapshot, FlowSession } from "./session"
export type { FlowSuite, FlowSuiteOptions } from "./suite"
export { FLOW_SUITE_ENV, planFlowSuite } from "./suite"
