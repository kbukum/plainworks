import { AbortError, TimeoutError, type WebAbortSignal, withTimeout } from "@plainworks/std"
import { applyAllowances, capFindingsPerCheck, type Finding } from "../checks/findings"
import { judgeLayout, judgeLayoutShift } from "../checks/heuristics"
import type { CheckpointChecks, Flow, FlowCheckpoint } from "./definition"
import { FlowError, type FlowErrorKind } from "./errors"
import type { PageVariant } from "./matrix/axes"
import type { DevicePlan } from "./matrix/expand"
import { type CheckpointLocation, type FlowRunWriter, flowArtifactPaths } from "./report/artifacts"
import type {
  CheckpointReport,
  EvidenceLinks,
  FlowDeviceReport,
  FlowRunMode,
  FlowStatus,
  ReportedError,
  VariantReport,
} from "./report/schema"
import type { FlowSession } from "./session"
import { captureStableFrame } from "./stable-frame"

/** Time budgets, in ms, for the steps of a flow. */
export interface FlowTimeouts {
  /** One checkpoint's action. */
  readonly action: number
  /** The checkpoint's ready element to show. */
  readonly ready: number
  /** The `main` landmark to hydrate. */
  readonly hydration: number
  /** Any other single step: a variant switch, a measurement, a scan, a frame. */
  readonly step: number
}

/** Budgets that fit a local app; a slow CI host raises them. */
export const DEFAULT_FLOW_TIMEOUTS: FlowTimeouts = {
  action: 15_000,
  ready: 10_000,
  hydration: 10_000,
  step: 30_000,
}

/** Options for {@link runFlowOnDevice}. */
export interface DeviceRunOptions {
  readonly flow: Flow
  readonly plan: DevicePlan
  readonly session: FlowSession
  readonly run: FlowRunWriter
  readonly mode: FlowRunMode
  readonly timeouts?: Partial<FlowTimeouts>
  readonly signal?: AbortSignal
}

/**
 * Replay a flow once on one device and report every checkpoint × variant. At each checkpoint it
 * acts, waits for the ready element and hydration, then for each variant switches the live page,
 * settles it, captures a stable frame and ARIA snapshot (in `capture` mode), and runs the
 * checkpoint's checks. A failed check fails its variant and writes an evidence bundle.
 *
 * A step that cannot finish (an action throws, the ready element never shows, a frame never
 * settles, a timeout, a cancel) ends the flow: the checkpoint records the typed error with its
 * evidence, and the checkpoints after it are skipped. It never throws for a flow failure; the
 * caller reads the returned report's `status`.
 */
export async function runFlowOnDevice(options: DeviceRunOptions): Promise<FlowDeviceReport> {
  const context: RunContext = {
    ...options,
    timeouts: { ...DEFAULT_FLOW_TIMEOUTS, ...options.timeouts },
  }
  const checkpoints: CheckpointReport[] = []
  let error: ReportedError | undefined
  for (const [index, checkpoint] of options.flow.checkpoints.entries()) {
    if (error !== undefined) {
      checkpoints.push(skipped(index, checkpoint))
      continue
    }
    const report = await runCheckpoint(context, index, checkpoint)
    checkpoints.push(report)
    error = report.error
  }
  const statuses = checkpoints.map((checkpoint) => checkpoint.status)
  return {
    flow: options.flow.name,
    device: options.plan.device.id,
    mode: options.mode,
    status: statuses.includes("error") ? "error" : statuses.includes("fail") ? "fail" : "pass",
    ...(error === undefined ? {} : { error }),
    checkpoints,
  }
}

interface RunContext extends Omit<DeviceRunOptions, "timeouts"> {
  readonly timeouts: FlowTimeouts
}

type ResolvedChecks = Required<CheckpointChecks>

const resolveChecks = (checks: CheckpointChecks = {}): ResolvedChecks => ({
  axe: checks.axe ?? true,
  overflow: checks.overflow ?? true,
  focus: checks.focus ?? false,
  hydration: checks.hydration ?? true,
  heuristics: checks.heuristics ?? true,
})

async function runCheckpoint(
  context: RunContext,
  index: number,
  checkpoint: FlowCheckpoint,
): Promise<CheckpointReport> {
  const { session, timeouts, plan } = context
  const at: CheckpointLocation = {
    flow: context.flow.name,
    device: plan.device.id,
    index,
    checkpoint: checkpoint.name,
  }
  const checks = resolveChecks(checkpoint.checks)
  const findings: Finding[] = []
  const variants: VariantReport[] = []
  const step = <T>(
    what: string,
    work: (signal: AbortSignal) => Promise<T>,
    ms = timeouts.step,
    kind?: FlowErrorKind,
  ) => runStep(context, `"${checkpoint.name}" › ${what}`, work, ms, kind)
  let failure: FlowError | undefined
  let switched = false
  try {
    await step("action", (signal) => session.act(checkpoint, signal), timeouts.action, "action")
    const ready = await step("ready", (signal) =>
      session.waitReady(checkpoint, timeouts.ready, signal),
    )
    if (!ready) {
      throw new FlowError(
        "readiness",
        `Checkpoint "${checkpoint.name}" never showed its ready element within ${timeouts.ready}ms`,
      )
    }
    if (checks.hydration) {
      const hydrated = await step("hydration", (signal) =>
        session.waitHydrated(timeouts.hydration, signal),
      )
      if (!hydrated) {
        findings.push({
          check: "hydration",
          message: `The main landmark did not hydrate within ${timeouts.hydration}ms`,
        })
      }
    }
    for (const variant of plan.variants) {
      switched = true
      await step(`variant ${variant.id}`, (signal) => session.applyVariant(variant, signal))
      variants.push(await runVariant(context, at, checkpoint, checks, variant))
    }
  } catch (error) {
    failure = toFlowError(error, `"${checkpoint.name}"`)
  }
  if (switched) {
    try {
      await step("restore", (signal) => session.restoreVariant(signal))
    } catch (error) {
      failure ??= toFlowError(error, `"${checkpoint.name}" › restore`)
    }
  }
  for (const runtime of session.drainRuntimeErrors()) {
    findings.push({ check: "runtime", message: `${runtime.kind}: ${runtime.message}` })
  }

  const judged = applyAllowances(findings, checkpoint.allow ?? [])
  let failures = judged.failures
  const status: FlowStatus =
    failure !== undefined
      ? "error"
      : failures.length > 0 || variants.some((variant) => variant.status === "fail")
        ? "fail"
        : "pass"
  let error: ReportedError | undefined =
    failure === undefined ? undefined : { kind: failure.reason, message: failure.message }
  let evidence: EvidenceLinks | undefined
  if ((failure !== undefined || failures.length > 0) && failure?.reason !== "aborted") {
    const collected = await collectEvidence(context, at, checkpoint, "checkpoint", {})
    if (collected.links !== undefined) evidence = collected.links
    else if (error === undefined) failures = [unavailable(collected.problem), ...failures]
    else
      error = { ...error, message: `${error.message} (evidence unavailable: ${collected.problem})` }
  }
  return {
    index,
    name: checkpoint.name,
    status,
    findings: capFindingsPerCheck(failures),
    allowed: judged.allowed,
    ...(error === undefined ? {} : { error }),
    ...(evidence === undefined ? {} : { evidence }),
    variants,
  }
}

async function runVariant(
  context: RunContext,
  at: CheckpointLocation,
  checkpoint: FlowCheckpoint,
  checks: ResolvedChecks,
  variant: PageVariant,
): Promise<VariantReport> {
  const { session, run, mode, plan } = context
  const step = <T>(what: string, work: (signal: AbortSignal) => Promise<T>) =>
    runStep(context, `"${checkpoint.name}" › ${variant.id} › ${what}`, work, context.timeouts.step)
  const before = checks.heuristics
    ? await step("layout", (signal) => session.measureLayout(signal))
    : undefined
  await step("settle", (signal) => session.settle(signal))

  let frame: string | undefined
  if (mode === "capture") {
    const bytes = await captureStableFrame(
      () => step("frame", (signal) => session.screenshot(checkpoint, signal)),
      context.signal === undefined ? {} : { signal: context.signal },
    )
    frame = await run.write(flowArtifactPaths.variant(at, variant.id, "png"), bytes, context.signal)
  }

  const findings: Finding[] = []
  if (before !== undefined) {
    const after = await step("layout", (signal) => session.measureLayout(signal))
    findings.push(...judgeLayoutShift(before.tracked, after.tracked), ...judgeLayout(after))
  }
  if (checks.axe) {
    const violations = await step("axe", (signal) => session.scanAxe(checkpoint.axe ?? {}, signal))
    findings.push(...violations.map((message): Finding => ({ check: "axe", message })))
  }
  if (checks.overflow) {
    const overflow = await step("overflow", (signal) => session.horizontalOverflow(signal))
    if (overflow > 0) {
      findings.push({
        check: "reflow",
        message: `The page scrolls ${overflow}px sideways at ${plan.device.viewport.width}px wide`,
      })
    }
    const overlays = await step("overlays", (signal) => session.overlaysOutsideViewport(signal))
    findings.push(...overlays.map((message): Finding => ({ check: "overlay", message })))
  }
  if (checks.focus) {
    const problems = await step("focus", (signal) => session.focusProblems(signal))
    findings.push(...problems.map((message): Finding => ({ check: "focus", message })))
  }

  let aria: string | undefined
  if (mode === "capture") {
    const snapshot = await step("aria", (signal) => session.ariaSnapshot(signal))
    aria = await run.write(
      flowArtifactPaths.variant(at, variant.id, "aria.yml"),
      snapshot,
      context.signal,
    )
  }
  if (checkpoint.pixel === true) {
    const name = `${at.flow}-${at.device}-${at.checkpoint}-${variant.id}`
    const mismatch = await step("pixel", (signal) =>
      session.comparePixels(checkpoint, name, signal),
    )
    if (mismatch !== undefined) findings.push({ check: "pixel", message: mismatch })
  }

  const judged = applyAllowances(findings, checkpoint.allow ?? [])
  let failures = judged.failures
  const failed = failures.length > 0
  let evidence: EvidenceLinks | undefined
  if (failed) {
    const collected = await collectEvidence(context, at, checkpoint, variant.id, {
      ...(frame === undefined ? {} : { frame }),
      ...(aria === undefined ? {} : { aria }),
    })
    evidence = collected.links
    if (collected.problem !== undefined) failures = [unavailable(collected.problem), ...failures]
  }
  return {
    id: variant.id,
    mode: variant.mode,
    theme: variant.theme,
    density: variant.density,
    preference: variant.preference,
    status: failed ? "fail" : "pass",
    findings: capFindingsPerCheck(failures),
    allowed: judged.allowed,
    ...(frame === undefined ? {} : { frame }),
    ...(aria === undefined ? {} : { aria }),
    ...(evidence === undefined ? {} : { evidence }),
  }
}

/** What evidence collection produced: its links, or why there are none. */
type CollectedEvidence =
  | { readonly links: EvidenceLinks; readonly problem?: undefined }
  | { readonly links?: undefined; readonly problem: string }

/**
 * Write the page's DOM, ARIA tree, console, network, and frame next to the failure. It never
 * throws: a bundle that cannot be collected comes back as the problem, for the report to show.
 */
async function collectEvidence(
  context: RunContext,
  at: CheckpointLocation,
  checkpoint: FlowCheckpoint,
  name: string,
  known: { readonly frame?: string; readonly aria?: string },
): Promise<CollectedEvidence> {
  const { session, run } = context
  const path = (extension: string) => flowArtifactPaths.variant(at, name, extension)
  // Evidence runs after a failure, so it is bounded by a fresh budget rather than the cancel
  // signal. The budget's signal stops every capture and write once it runs out.
  const ms = context.timeouts.step
  try {
    const links = await withTimeout(async (budget): Promise<EvidenceLinks> => {
      const signal = hostSignal(budget)
      const snapshot = await session.evidence(signal)
      const aria =
        known.aria ??
        (await run.write(path("aria.yml"), await session.ariaSnapshot(signal), signal))
      const frame =
        known.frame ??
        (await run.write(path("png"), await session.screenshot(checkpoint, signal), signal))
      return {
        dom: await run.write(path("dom.html"), snapshot.dom, signal),
        aria,
        console: await run.write(path("console.json"), snapshot.console, signal),
        network: await run.write(path("network.json"), snapshot.network, signal),
        frame,
      }
    }, ms)
    return { links }
  } catch (error) {
    return { problem: toFlowError(error, "evidence", "session", ms).message }
  }
}

const unavailable = (problem: string): Finding => ({
  check: "runtime",
  message: `evidence unavailable: ${problem}`,
})

/** Run one step under its budget and the run's cancel signal, as a typed flow error. */
async function runStep<T>(
  context: RunContext,
  what: string,
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  kind: FlowErrorKind = "session",
): Promise<T> {
  try {
    return await withTimeout(
      (signal) => work(hostSignal(signal)),
      ms,
      context.signal === undefined ? undefined : { signal: context.signal },
    )
  } catch (error) {
    throw toFlowError(error, what, kind, ms)
  }
}

/**
 * The host `AbortSignal` behind std's structural signal, which Playwright and Node need. The
 * signal `withTimeout` hands out is one; anything else gets a host signal that follows it.
 */
function hostSignal(signal: WebAbortSignal): AbortSignal {
  if (signal instanceof AbortSignal) return signal
  const controller = new AbortController()
  if (signal.aborted) controller.abort(signal.reason)
  else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
  return controller.signal
}

function toFlowError(
  error: unknown,
  what: string,
  kind: FlowErrorKind = "session",
  ms = 0,
): FlowError {
  if (error instanceof FlowError) return error
  if (error instanceof TimeoutError) {
    return new FlowError("timeout", `${what} timed out after ${ms}ms`, { cause: error })
  }
  if (error instanceof AbortError) {
    return new FlowError("aborted", `${what} was cancelled`, { cause: error })
  }
  return new FlowError(kind, `${what} failed: ${messageOf(error)}`, { cause: error })
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const skipped = (index: number, checkpoint: FlowCheckpoint): CheckpointReport => ({
  index,
  name: checkpoint.name,
  status: "skipped",
  findings: [],
  allowed: [],
  variants: [],
})
