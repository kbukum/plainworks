import type { Page, TestInfo } from "@playwright/test"
import type { RuntimeErrorWatch } from "../checks/runtime-errors"
import { type FlowTimeouts, runFlowOnDevice } from "./device-run"
import { FlowError } from "./errors"
import { flowOutcomeError } from "./outcome"
import { createPageFlowSession } from "./page-session"
import type { PlannedFlowRun } from "./plan"
import {
  FLOW_RUN_ENV,
  finishFlowRun,
  flowArtifactPaths,
  openFlowRun,
  startFlowRun,
} from "./report/artifacts"
import type { RetentionPolicy } from "./report/retention"
import type { FlowDeviceReport, FlowRunMode } from "./report/schema"

/** The gate fixtures a flow runs on. */
export interface FlowFixtures {
  readonly page: Page
  readonly runtimeErrors: RuntimeErrorWatch
}

/** Options for {@link runFlow}. */
export interface RunFlowOptions {
  /** `assert` checks only; `capture` also writes frames and ARIA snapshots. */
  readonly mode: FlowRunMode
  /** The run directory. Defaults to the one {@link setupFlowRun} publishes. */
  readonly runDir?: string
  /** The running test, so the report can point at its trace. */
  readonly testInfo?: TestInfo
  readonly timeouts?: Partial<FlowTimeouts>
  readonly signal?: AbortSignal
}

/**
 * Run one planned flow in a Playwright test and record it in the run. The entry is written even
 * when the flow fails, so the report always shows what happened; then the test fails with the
 * flow's typed {@link FlowError}.
 */
export async function runFlow(
  fixtures: FlowFixtures,
  planned: PlannedFlowRun,
  options: RunFlowOptions,
): Promise<FlowDeviceReport> {
  const runDir = options.runDir ?? process.env[FLOW_RUN_ENV]
  if (runDir === undefined || runDir === "") {
    throw new FlowError(
      "definition",
      `No flow run directory: call setupFlowRun from globalSetup, or pass runDir`,
    )
  }
  const run = openFlowRun(runDir)
  const session = createPageFlowSession({
    page: fixtures.page,
    runtimeErrors: fixtures.runtimeErrors,
    axes: planned.axes,
  })
  let report: FlowDeviceReport
  try {
    report = await runFlowOnDevice({
      flow: planned.flow,
      plan: planned.plan,
      session,
      run,
      mode: options.mode,
      ...(options.timeouts === undefined ? {} : { timeouts: options.timeouts }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
  } finally {
    session.dispose()
  }
  const trace = traceOf(options.testInfo)
  const entry: FlowDeviceReport = trace === undefined ? report : { ...report, trace }
  await run.write(
    flowArtifactPaths.entry(planned.flow.name, planned.plan.device.id),
    `${JSON.stringify(entry, null, 2)}\n`,
  )
  const failure = flowOutcomeError(entry)
  if (failure !== undefined) throw failure
  return entry
}

/** Where the test's trace lands, when the project records one. */
function traceOf(testInfo: TestInfo | undefined): string | undefined {
  if (testInfo === undefined) return undefined
  const setting = testInfo.project.use.trace
  const mode = typeof setting === "object" ? setting.mode : setting
  return mode === undefined || mode === "off" ? undefined : testInfo.outputPath("trace.zip")
}

/** Options for {@link setupFlowRun}. */
export interface SetupFlowRunOptions {
  /** The artifact root, such as `.ui-artifacts`. Keep it out of version control. */
  readonly root: string
  readonly retention?: RetentionPolicy
}

/**
 * Start a run for one Playwright invocation, from its `globalSetup`. It publishes the run
 * directory to the workers, and returns the teardown Playwright calls once every test finished:
 * that merges the run's entries into `report.json` and `report.md`, points `<root>/latest` at the
 * run, and prunes old runs.
 */
export async function setupFlowRun(options: SetupFlowRunOptions): Promise<() => Promise<void>> {
  const run = await startFlowRun({ root: options.root })
  process.env[FLOW_RUN_ENV] = run.dir
  return async () => {
    await finishFlowRun({
      root: options.root,
      run,
      ...(options.retention === undefined ? {} : { retention: options.retention }),
    })
  }
}
