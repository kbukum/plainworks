import { posix } from "node:path"
import { FlowError } from "../flow/errors"
import type { MatrixPresetName } from "../flow/matrix/presets"
import {
  type ArtifactStore,
  collectFlowRun,
  FLOW_RUN_ENV,
  type FlowRun,
  openFlowRun,
  publishFlowRun,
  startFlowRun,
} from "../flow/report/artifacts"
import { describeChangeTotals } from "../flow/report/markdown"
import type { ChangeReview, FlowReport, FlowSelection, ReviewBase } from "../flow/report/schema"
import { FLOW_SUITE_ENV, planFlowSuite } from "../flow/suite"
import { GATE_ORIGIN_ENV } from "../gate"
import { reviewChanges } from "../review/compare"
import { type SheetRenderer, writeContactSheets } from "../review/sheets"
import { selectAffectedFlows } from "./affected"
import { parseUiCheckArgs, UI_CHECK_USAGE, type UiCheckArgs } from "./args"
import {
  baseCacheKey,
  evictBases,
  readStoredReport,
  recordBaseUse,
  saveSnapshot,
  uiCheckPaths,
} from "./baselines"
import type { UiCheckConfig } from "./config"
import { UiCheckError } from "./errors"
import { changedFilesSince, type GitRunner, mergeBaseWith } from "./git"

/** `ui:check` exit codes: no hard failure, a hard failure, or a harness or usage error. */
export const UI_CHECK_EXIT: { readonly pass: 0; readonly fail: 1; readonly harness: 2 } = {
  pass: 0,
  fail: 1,
  harness: 2,
}

/** One Playwright invocation of the flow spec. */
export interface SuiteInvocation {
  /** The suite's environment: the run directory, flows, preset, mode, and any host origin. */
  readonly env: Readonly<Record<string, string>>
  /** Force this many workers, such as one against a shared host. */
  readonly workers?: number
  /** Where Playwright's output goes. */
  readonly log: string
  readonly signal?: AbortSignal
}

/** A request to capture the flows against a base commit, into `run`. */
export interface BaseCapture {
  readonly commit: string
  readonly run: FlowRun
  /** The suite's flows, preset, and mode; the capture adds the run directory and host origin. */
  readonly env: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

/** The seams `ui:check` runs through, injectable so the command's logic is testable. */
export interface UiCheckRuntime {
  readonly store: ArtifactStore
  readonly git: GitRunner
  /** Whether something already answers at `url`. */
  readonly serving: (url: string) => Promise<boolean>
  /** Run the flow spec and resolve Playwright's exit code. */
  readonly runSuite: (invocation: SuiteInvocation) => Promise<number>
  /** Capture the flows against a base commit's host. Throws a `base` {@link UiCheckError}. */
  readonly captureBase: (capture: BaseCapture) => Promise<void>
  /** Keep a signed-in warm host running until the process is stopped. */
  readonly serve: () => Promise<void>
  /** Renders contact sheets to PNG. Without one, sheets stay HTML. */
  readonly renderSheet?: SheetRenderer
  readonly now: () => number
  readonly print: (line: string) => void
  readonly signal?: AbortSignal
}

/**
 * Run `ui:check` for one app and resolve its exit code: {@link UI_CHECK_EXIT}. A check captures the
 * selected flows over the preset, reviews what changed against a base, writes contact sheets, and
 * publishes `report.json` and `report.md`. Visual changes are reported, never failed; only a
 * failed check or a flow error fails. The report path is always printed.
 */
export async function runUiCheck(
  argv: readonly string[],
  config: UiCheckConfig,
  runtime: UiCheckRuntime,
): Promise<number> {
  try {
    const args = parseUiCheckArgs(argv)
    if (args.command === "help") {
      runtime.print(UI_CHECK_USAGE)
      return UI_CHECK_EXIT.pass
    }
    if (args.command === "serve") {
      await runtime.serve()
      return UI_CHECK_EXIT.pass
    }
    return await check(args, config, runtime)
  } catch (error) {
    runtime.print(`ui:check harness error: ${describeError(error)}`)
    return UI_CHECK_EXIT.harness
  }
}

type CheckArgs = Extract<UiCheckArgs, { command: "check" }>

async function check(
  args: CheckArgs,
  config: UiCheckConfig,
  runtime: UiCheckRuntime,
): Promise<number> {
  const { store, signal } = runtime
  const selection = await selectFlows(args, config, runtime.git)
  const suiteEnv = {
    [FLOW_SUITE_ENV.flows]: selection.flows.map((flow) => flow.name).join(","),
    [FLOW_SUITE_ENV.preset]: args.preset,
    [FLOW_SUITE_ENV.mode]: "capture",
  }
  const run = await startFlowRun({ root: config.root, store, now: runtime.now })
  const writer = openFlowRun(run.dir, store)
  const publish = async (report: FlowReport): Promise<void> => {
    await publishFlowRun({
      root: config.root,
      run,
      report,
      store,
      ...(config.retention === undefined ? {} : { retention: config.retention }),
    })
  }

  if (selection.flows.length === 0) {
    const report = await collectFlowRun({ run, store, now: runtime.now })
    await publish({ ...report, selection, review: skipped("No flow ran") })
    runtime.print("ui:check pass: no changed file affects a flow, so nothing ran.")
    printReportPath(runtime, run)
    return UI_CHECK_EXIT.pass
  }

  const expected = planFlowSuite(config.flows, {
    ...(config.axes === undefined ? {} : { axes: config.axes }),
    env: suiteEnv,
  }).runs.length
  const warm = `http://127.0.0.1:${config.warmPort}`
  const reuse = await runtime.serving(`${warm}${config.host.readyPath}`)
  if (reuse) runtime.print(`Reusing the warm host at ${warm}.`)
  const exitCode = await runtime.runSuite({
    env: { ...suiteEnv, [FLOW_RUN_ENV]: run.dir, ...(reuse ? { [GATE_ORIGIN_ENV]: warm } : {}) },
    ...(reuse ? { workers: 1 } : {}),
    log: posix.join(run.dir, "playwright.log"),
    ...(signal === undefined ? {} : { signal }),
  })
  const collected = await collectFlowRun({ run, store, now: runtime.now })

  if (collected.runs.length < expected) {
    await publish({ ...collected, selection, review: skipped("The run is incomplete") })
    runtime.print(
      `ui:check harness error: only ${collected.runs.length} of ${expected} flow runs reported. See ${posix.join(run.dir, "playwright.log")}.`,
    )
    printReportPath(runtime, run)
    return UI_CHECK_EXIT.harness
  }

  let review: ChangeReview
  let harnessError: unknown
  try {
    review = await reviewAgainstBase(args, config, runtime, collected, run, suiteEnv)
  } catch (error) {
    harnessError = error
    review = skipped(`The base could not be captured: ${describeError(error)}`)
  }
  const sheets = await writeContactSheets({
    report: collected,
    review,
    writer,
    ...(runtime.renderSheet === undefined ? {} : { render: runtime.renderSheet }),
    ...(signal === undefined ? {} : { signal }),
  })
  const report: FlowReport = { ...collected, selection, review, sheets }
  await publish(report)
  if (args.saveAs !== undefined) {
    const dir = await saveSnapshot(store, config.root, run, args.saveAs)
    runtime.print(`Saved this run as the "${args.saveAs}" snapshot (${dir}).`)
  }

  const failed = report.summary.verdict === "fail" || exitCode !== 0
  printSummary(runtime, report, exitCode, run)
  if (harnessError !== undefined) {
    runtime.print(`ui:check harness error: ${describeError(harnessError)}`)
    return UI_CHECK_EXIT.harness
  }
  return failed ? UI_CHECK_EXIT.fail : UI_CHECK_EXIT.pass
}

async function selectFlows(
  args: CheckArgs,
  config: UiCheckConfig,
  git: GitRunner,
): Promise<FlowSelection> {
  const { select, preset } = args
  if (select.by === "all") {
    return {
      by: "all",
      preset,
      flows: config.flows.map((flow) => ({ name: flow.name, reasons: ["every flow runs"] })),
    }
  }
  if (select.by === "named") {
    for (const name of select.flows) {
      if (!config.flows.some((flow) => flow.name === name)) {
        const known = config.flows.map((flow) => flow.name).join(", ")
        throw new UiCheckError("usage", `Unknown flow "${name}"; the flows are ${known}`)
      }
    }
    return {
      by: "named",
      preset,
      flows: select.flows.map((name) => ({ name, reasons: ["named with --flow"] })),
    }
  }
  const since = await mergeBaseWith(git, config.affectedBase ?? "origin/main")
  const changed = await changedFilesSince(git, since)
  const affected = selectAffectedFlows({
    flows: config.flows,
    changed,
    ...(config.ignore === undefined ? {} : { ignore: config.ignore }),
  })
  return {
    by: "affected",
    preset,
    since: since.slice(0, 12),
    changedFiles: changed.length,
    unmapped: affected.unmapped,
    flows: affected.flows,
  }
}

const BEFORE = "before"

async function reviewAgainstBase(
  args: CheckArgs,
  config: UiCheckConfig,
  runtime: UiCheckRuntime,
  current: FlowReport,
  run: FlowRun,
  suiteEnv: Readonly<Record<string, string>>,
): Promise<ChangeReview> {
  if (!args.diff) return skipped("Skipped with --no-diff")
  if (args.base === undefined && args.saveAs !== undefined) {
    return skipped(`Saved as "${args.saveAs}"; pass --base to compare as well`)
  }
  const base = await resolveBase(args.base, args.preset, config, runtime, current, suiteEnv)
  if (base === undefined) {
    return skipped(
      `No base: run ui:check --save-as ${BEFORE} before a change, or pass --base <ref>`,
    )
  }
  return reviewChanges({
    base,
    current: { report: current, dir: run.dir },
    writer: openFlowRun(run.dir, runtime.store),
    store: runtime.store,
    ...(runtime.signal === undefined ? {} : { signal: runtime.signal }),
  })
}

interface ResolvedBase {
  readonly report: FlowReport
  readonly dir: string
  readonly source: Omit<ReviewBase, "runId">
}

async function resolveBase(
  name: string | undefined,
  preset: MatrixPresetName,
  config: UiCheckConfig,
  runtime: UiCheckRuntime,
  current: FlowReport,
  suiteEnv: Readonly<Record<string, string>>,
): Promise<ResolvedBase | undefined> {
  const { store } = runtime
  const snapshot = uiCheckPaths.snapshot(config.root, name ?? BEFORE)
  const saved = /^[a-z0-9-]+$/.test(name ?? BEFORE)
    ? await readStoredReport(store, snapshot)
    : undefined
  if (saved !== undefined) {
    return { report: saved, dir: snapshot, source: { kind: "snapshot", name: name ?? BEFORE } }
  }
  if (name === undefined) return undefined

  const commit = await mergeBaseWith(runtime.git, name)
  const flows = config.flows.filter((flow) => current.runs.some((run) => run.flow === flow.name))
  const key = baseCacheKey({ commit, flows, preset })
  const dir = uiCheckPaths.base(config.root, key)
  let report = await readStoredReport(store, dir)
  if (report === undefined) {
    runtime.print(`Capturing the base at ${commit.slice(0, 12)} (${name}); later runs reuse it.`)
    await store.remove(dir)
    const run = { id: key, dir }
    await runtime.captureBase({
      commit,
      run,
      env: suiteEnv,
      ...(runtime.signal === undefined ? {} : { signal: runtime.signal }),
    })
    const captured = await collectFlowRun({ run, store, now: runtime.now })
    if (captured.runs.length === 0) {
      throw new UiCheckError("base", `The base at ${commit.slice(0, 12)} captured no flow runs`)
    }
    await store.write(posix.join(dir, "report.json"), `${JSON.stringify(captured, null, 2)}\n`)
    report = captured
  } else {
    runtime.print(`Reusing the captured base at ${commit.slice(0, 12)} (${name}).`)
  }
  await recordBaseUse(store, dir, { commit, ref: name, usedAt: runtime.now() })
  await evictBases(store, config.root, {
    inUse: key,
    ...(config.keepBases === undefined ? {} : { keep: config.keepBases }),
  })
  return { report, dir, source: { kind: "git", name, commit: commit.slice(0, 12) } }
}

const skipped = (reason: string): ChangeReview => ({ status: "skipped", reason })

function printSummary(
  runtime: UiCheckRuntime,
  report: FlowReport,
  exitCode: number,
  run: FlowRun,
): void {
  const { summary, review, sheets } = report
  const verdict = summary.verdict === "fail" || exitCode !== 0 ? "fail" : "pass"
  runtime.print(
    `ui:check ${verdict}: ${summary.flows} flows, ${summary.runs} runs, ${summary.frames} frames, ${summary.failures} failures, ${summary.errors} errors.`,
  )
  if (summary.verdict === "pass" && exitCode !== 0) {
    runtime.print(
      `Playwright exited with ${exitCode} although every flow passed. See ${posix.join(run.dir, "playwright.log")}.`,
    )
  }
  if (review?.status === "compared") {
    const { totals, base } = review
    runtime.print(
      `Visual changes against ${base.kind} "${base.name}": ${describeChangeTotals(totals)}.`,
    )
  } else if (review?.status === "skipped") {
    runtime.print(`Visual changes not reviewed: ${review.reason}.`)
  }
  if (sheets?.changed !== undefined) {
    runtime.print(`Changed frames: ${posix.join(run.dir, sheets.changed)}`)
  }
  printReportPath(runtime, run)
}

function printReportPath(runtime: UiCheckRuntime, run: FlowRun): void {
  runtime.print(
    `Report: ${posix.join(run.dir, "report.md")} (${posix.join(run.dir, "report.json")})`,
  )
}

function describeError(error: unknown): string {
  if (error instanceof UiCheckError || error instanceof FlowError) return error.message
  return error instanceof Error ? error.message : String(error)
}
