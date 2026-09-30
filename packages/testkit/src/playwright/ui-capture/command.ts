import { posix } from "node:path"
import type { Clock } from "@plainworks/std/time"
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
import { parseUiCaptureArgs, UI_CAPTURE_USAGE, type UiCaptureArgs } from "./args"
import {
  baseCacheKey,
  evictBases,
  readStoredReport,
  recordBaseUse,
  saveSnapshot,
  uiCapturePaths,
} from "./baselines"
import type { UiCaptureConfig } from "./config"
import { type DocsImage, docsImagesOf, publishDocsImages } from "./docs-images"
import { UiCaptureError } from "./errors"
import { changedFilesSince, type GitRunner, mergeBaseWith } from "./git"

/** `ui:capture` exit codes: captured, a flow broke, or a harness or usage error. */
export const UI_CAPTURE_EXIT: { readonly pass: 0; readonly fail: 1; readonly harness: 2 } = {
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

/** The seams `ui:capture` runs through, injectable so the command's logic is testable. */
export interface UiCaptureRuntime {
  readonly store: ArtifactStore
  readonly git: GitRunner
  /** Whether something already answers at `url`. */
  readonly serving: (url: string) => Promise<boolean>
  /** Run the flow spec and resolve Playwright's exit code. */
  readonly runSuite: (invocation: SuiteInvocation) => Promise<number>
  /** Capture the flows against a base commit's host. Throws a `base` {@link UiCaptureError}. */
  readonly captureBase: (capture: BaseCapture) => Promise<void>
  /** Keep a signed-in warm host running until the process is stopped. */
  readonly serve: () => Promise<void>
  /** Renders contact sheets to PNG. Without one, sheets stay HTML. */
  readonly renderSheet?: SheetRenderer
  readonly clock: Clock
  readonly print: (line: string) => void
  readonly signal?: AbortSignal
}

/**
 * Run `ui:capture` for one app and resolve its exit code: {@link UI_CAPTURE_EXIT}. It captures a
 * frame and an ARIA snapshot at every checkpoint of the selected flows over the preset, writes
 * contact sheets, and publishes `report.json` and `report.md`. With `--base`, it also shows what
 * changed against a saved snapshot or a git ref. With `--docs`, it captures the flows that mark
 * docs images and copies those frames into `config.docsDir`, only when every flow ran cleanly.
 * It runs no checks, so only a flow that breaks (an error, a runtime error, a missed hydration)
 * fails. The report path is always printed.
 */
export async function runUiCapture(
  argv: readonly string[],
  config: UiCaptureConfig,
  runtime: UiCaptureRuntime,
): Promise<number> {
  try {
    const args = parseUiCaptureArgs(argv)
    if (args.command === "help") {
      runtime.print(UI_CAPTURE_USAGE)
      return UI_CAPTURE_EXIT.pass
    }
    if (args.command === "serve") {
      await runtime.serve()
      return UI_CAPTURE_EXIT.pass
    }
    return await capture(args, config, runtime)
  } catch (error) {
    runtime.print(`ui:capture harness error: ${describeError(error)}`)
    return UI_CAPTURE_EXIT.harness
  }
}

type CaptureArgs = Extract<UiCaptureArgs, { command: "capture" }>

async function capture(
  args: CaptureArgs,
  config: UiCaptureConfig,
  runtime: UiCaptureRuntime,
): Promise<number> {
  const { store, signal } = runtime
  const docs = args.select.by === "docs" ? docsTarget(config) : undefined
  const selection = await selectFlows(args, config, runtime.git, docs?.images ?? [])
  const suiteEnv = {
    [FLOW_SUITE_ENV.flows]: selection.flows.map((flow) => flow.name).join(","),
    [FLOW_SUITE_ENV.preset]: args.preset,
    [FLOW_SUITE_ENV.mode]: "capture",
  }
  const run = await startFlowRun({ root: config.root, store, clock: runtime.clock })
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
    const report = await collectFlowRun({ run, store, clock: runtime.clock })
    await publish({ ...report, selection })
    runtime.print("ui:capture pass: no changed file affects a flow, so nothing ran.")
    printReportPath(runtime, run)
    return UI_CAPTURE_EXIT.pass
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
  const collected = await collectFlowRun({ run, store, clock: runtime.clock })

  if (collected.runs.length < expected) {
    await publish({ ...collected, selection })
    runtime.print(
      `ui:capture harness error: only ${collected.runs.length} of ${expected} flow runs reported. See ${posix.join(run.dir, "playwright.log")}.`,
    )
    printReportPath(runtime, run)
    return UI_CAPTURE_EXIT.harness
  }

  let review: ChangeReview | undefined
  let harnessError: unknown
  try {
    review = await reviewAgainstBase(args, config, runtime, collected, run, suiteEnv)
  } catch (error) {
    harnessError = error
    review = skipped(`The base could not be captured: ${describeError(error)}`)
  }
  const sheets = await writeContactSheets({
    report: collected,
    ...(review === undefined ? {} : { review }),
    writer,
    ...(runtime.renderSheet === undefined ? {} : { render: runtime.renderSheet }),
    ...(signal === undefined ? {} : { signal }),
  })
  const report: FlowReport = {
    ...collected,
    selection,
    ...(review === undefined ? {} : { review }),
    sheets,
  }
  await publish(report)
  if (args.saveAs !== undefined) {
    const dir = await saveSnapshot(store, config.root, run, args.saveAs)
    runtime.print(`Saved this run as the "${args.saveAs}" snapshot (${dir}).`)
  }

  const failed = report.summary.verdict === "fail" || exitCode !== 0
  printSummary(runtime, report, exitCode, run)
  if (harnessError !== undefined) {
    runtime.print(`ui:capture harness error: ${describeError(harnessError)}`)
    return UI_CAPTURE_EXIT.harness
  }
  if (docs !== undefined) {
    if (failed) {
      runtime.print("Docs images not written: a docs flow broke.")
    } else {
      const published = await publishDocsImages({
        ...docs,
        report,
        runDir: run.dir,
        store,
        ...(signal === undefined ? {} : { signal }),
      })
      runtime.print(`Docs images written to ${docs.dir}: ${published.written.join(", ")}.`)
      if (published.removed.length > 0) {
        runtime.print(`Docs images removed from ${docs.dir}: ${published.removed.join(", ")}.`)
      }
    }
  }
  return failed ? UI_CAPTURE_EXIT.fail : UI_CAPTURE_EXIT.pass
}

interface DocsTarget {
  readonly images: readonly DocsImage[]
  readonly dir: string
}

function docsTarget(config: UiCaptureConfig): DocsTarget {
  if (config.docsDir === undefined) {
    throw new UiCaptureError("usage", "--docs needs a docsDir in the app's ui:capture config")
  }
  const images = docsImagesOf(config.flows)
  if (images.length === 0) {
    throw new UiCaptureError(
      "usage",
      'No checkpoint marks a docs image; add `docs: "<name>"` to the checkpoints to publish',
    )
  }
  return { images, dir: config.docsDir }
}

async function selectFlows(
  args: CaptureArgs,
  config: UiCaptureConfig,
  git: GitRunner,
  docs: readonly DocsImage[],
): Promise<FlowSelection> {
  const { select, preset } = args
  if (select.by === "docs") {
    const flows = config.flows.flatMap((flow) => {
      const names = docs.filter((image) => image.flow === flow.name).map((image) => image.name)
      return names.length === 0
        ? []
        : [{ name: flow.name, reasons: [`marks docs images ${names.join(", ")}`] }]
    })
    return { by: "docs", preset, flows }
  }
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
        throw new UiCaptureError("usage", `Unknown flow "${name}"; the flows are ${known}`)
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

async function reviewAgainstBase(
  args: CaptureArgs,
  config: UiCaptureConfig,
  runtime: UiCaptureRuntime,
  current: FlowReport,
  run: FlowRun,
  suiteEnv: Readonly<Record<string, string>>,
): Promise<ChangeReview | undefined> {
  if (args.base === undefined) return undefined
  const base = await resolveBase(args.base, args.preset, config, runtime, current, suiteEnv)
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
  name: string,
  preset: MatrixPresetName,
  config: UiCaptureConfig,
  runtime: UiCaptureRuntime,
  current: FlowReport,
  suiteEnv: Readonly<Record<string, string>>,
): Promise<ResolvedBase> {
  const { store } = runtime
  const snapshot = uiCapturePaths.snapshot(config.root, name)
  const saved = /^[a-z0-9-]+$/.test(name) ? await readStoredReport(store, snapshot) : undefined
  if (saved !== undefined) {
    return { report: saved, dir: snapshot, source: { kind: "snapshot", name } }
  }

  const commit = await mergeBaseWith(runtime.git, name)
  const flows = config.flows.filter((flow) => current.runs.some((run) => run.flow === flow.name))
  const key = baseCacheKey({ commit, flows, preset })
  const dir = uiCapturePaths.base(config.root, key)
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
    const captured = await collectFlowRun({ run, store, clock: runtime.clock })
    if (captured.runs.length === 0) {
      throw new UiCaptureError("base", `The base at ${commit.slice(0, 12)} captured no flow runs`)
    }
    await store.write(posix.join(dir, "report.json"), `${JSON.stringify(captured, null, 2)}\n`)
    report = captured
  } else {
    runtime.print(`Reusing the captured base at ${commit.slice(0, 12)} (${name}).`)
  }
  await recordBaseUse(store, dir, { commit, ref: name, usedAt: runtime.clock.now() })
  await evictBases(store, config.root, {
    inUse: key,
    ...(config.keepBases === undefined ? {} : { keep: config.keepBases }),
  })
  return { report, dir, source: { kind: "git", name, commit: commit.slice(0, 12) } }
}

const skipped = (reason: string): ChangeReview => ({ status: "skipped", reason })

function printSummary(
  runtime: UiCaptureRuntime,
  report: FlowReport,
  exitCode: number,
  run: FlowRun,
): void {
  const { summary, review, sheets } = report
  const verdict = summary.verdict === "fail" || exitCode !== 0 ? "fail" : "pass"
  runtime.print(
    `ui:capture ${verdict}: ${summary.flows} flows, ${summary.runs} runs, ${summary.frames} frames, ${summary.failures} failures, ${summary.errors} errors.`,
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
  } else {
    runtime.print(`Frames: ${posix.join(run.dir, "flows")}`)
  }
  if (sheets?.changed !== undefined) {
    runtime.print(`Changed frames: ${posix.join(run.dir, sheets.changed)}`)
  }
  printReportPath(runtime, run)
}

function printReportPath(runtime: UiCaptureRuntime, run: FlowRun): void {
  runtime.print(
    `Report: ${posix.join(run.dir, "report.md")} (${posix.join(run.dir, "report.json")})`,
  )
}

function describeError(error: unknown): string {
  if (error instanceof UiCaptureError || error instanceof FlowError) return error.message
  return error instanceof Error ? error.message : String(error)
}
