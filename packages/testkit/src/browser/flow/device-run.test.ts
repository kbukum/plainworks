import type { Locator, Page } from "@playwright/test"
import { describe, expect, it } from "vitest"
import type { LayoutFacts } from "../checks/heuristics"
import type { RuntimeError } from "../checks/runtime-errors"
import { defineFlow, type Flow, type FlowCheckpoint } from "./definition"
import { runFlowOnDevice } from "./device-run"
import { expandFlowMatrix } from "./matrix/expand"
import type { ArtifactStore } from "./report/artifacts"
import { openFlowRun } from "./report/artifacts"
import type { FlowSession } from "./session"

const noop = async (_page: Page): Promise<void> => undefined
// The fake session never calls `ready`; a checkpoint only needs one to be well-formed.
const ready = (page: Page): Locator => page.getByRole("main")
const checkpoint = (name: string, extra: Partial<FlowCheckpoint> = {}): FlowCheckpoint => ({
  name,
  act: noop,
  ready,
  ...extra,
})

const EMPTY_FACTS: LayoutFacts = { texts: [], targets: [], focusables: [], images: [], tracked: [] }

/** A scripted page: every step succeeds with clean results unless a test overrides it. */
function fakeSession(overrides: Partial<FlowSession> = {}) {
  const calls: string[] = []
  const errors: RuntimeError[] = []
  let shot = 0
  const session: FlowSession = {
    act: async (checkpoint) => void calls.push(`act:${checkpoint.name}`),
    waitReady: async () => true,
    waitHydrated: async () => true,
    applyVariant: async (variant) => void calls.push(`variant:${variant.id}`),
    restoreVariant: async () => void calls.push("restore"),
    settle: async () => undefined,
    measureLayout: async () => EMPTY_FACTS,
    screenshot: async () => {
      shot++
      return Uint8Array.of(7)
    },
    ariaSnapshot: async () => "- main",
    scanAxe: async () => [],
    horizontalOverflow: async () => 0,
    overlaysOutsideViewport: async () => [],
    focusProblems: async () => [],
    comparePixels: async (_checkpoint, name) => void calls.push(`pixel:${name}`),
    drainRuntimeErrors: () => errors.splice(0),
    evidence: async () => ({ dom: "<html></html>", console: "[]", network: "[]" }),
    ...overrides,
  }
  return { session, calls, errors, shots: () => shot }
}

function memoryRun() {
  const files = new Map<string, string | Uint8Array>()
  const store: ArtifactStore = {
    createDir: async () => true,
    write: async (path, data) => void files.set(path, data),
    read: async () => "",
    list: async () => [],
    size: async () => 0,
    remove: async () => undefined,
    link: async () => undefined,
  }
  return { run: openFlowRun("/run", store), files }
}

const twoStep: Flow = defineFlow({
  name: "create-task",
  checkpoints: [checkpoint("board"), checkpoint("new-task")],
})
const [desktop] = expandFlowMatrix({
  devices: ["desktop"],
  modes: ["light", "dark"],
  themes: "default",
  densities: "default",
  preferences: ["standard"],
  sampling: "all",
})
if (desktop === undefined) throw new Error("the matrix has no desktop plan")

describe("runFlowOnDevice", () => {
  it("replays the flow once and visits every variant at every checkpoint", async () => {
    const { session, calls } = fakeSession()
    const { run } = memoryRun()
    const report = await runFlowOnDevice({
      flow: twoStep,
      plan: desktop,
      session,
      run,
      mode: "assert",
    })
    expect(report).toMatchObject({ flow: "create-task", device: "desktop", status: "pass" })
    expect(calls).toEqual([
      "act:board",
      "variant:light.default.default.standard",
      "variant:dark.default.default.standard",
      "restore",
      "act:new-task",
      "variant:light.default.default.standard",
      "variant:dark.default.default.standard",
      "restore",
    ])
  })

  it("writes a stable frame and an ARIA snapshot per variant in capture mode", async () => {
    const { session, shots } = fakeSession()
    const { run, files } = memoryRun()
    const report = await runFlowOnDevice({
      flow: twoStep,
      plan: desktop,
      session,
      run,
      mode: "capture",
    })
    const [, second] = report.checkpoints
    expect(second?.variants[1]).toMatchObject({
      frame: "flows/create-task/desktop/02-new-task/dark.default.default.standard.png",
      aria: "flows/create-task/desktop/02-new-task/dark.default.default.standard.aria.yml",
    })
    expect(
      files.get(
        "/run/flows/create-task/desktop/02-new-task/dark.default.default.standard.aria.yml",
      ),
    ).toBe("- main")
    // Two identical shots per stable frame, for two checkpoints × two variants.
    expect(shots()).toBe(8)
  })

  it("captures nothing in assert mode and compares pixels only where a checkpoint opts in", async () => {
    const flow = defineFlow({
      name: "board",
      checkpoints: [checkpoint("list"), checkpoint("detail", { pixel: true })],
    })
    const { session, calls, shots } = fakeSession()
    const { run, files } = memoryRun()
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "assert" })
    expect(shots()).toBe(0)
    expect(files.size).toBe(0)
    expect(report.checkpoints[0]?.variants[0]?.frame).toBeUndefined()
    expect(calls.filter((call) => call.startsWith("pixel:"))).toEqual([
      "pixel:board-desktop-detail-light.default.default.standard",
      "pixel:board-desktop-detail-dark.default.default.standard",
    ])
  })

  it("fails a variant on a check finding and writes its evidence bundle", async () => {
    const { session } = fakeSession({ scanAxe: async () => ["color-contrast: 2 nodes"] })
    const { run, files } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "assert" })
    const variant = report.checkpoints[0]?.variants[0]
    expect(report.status).toBe("fail")
    expect(variant).toMatchObject({
      status: "fail",
      findings: [{ check: "axe", message: "color-contrast: 2 nodes" }],
      evidence: {
        dom: "flows/one/desktop/01-only/light.default.default.standard.dom.html",
        aria: "flows/one/desktop/01-only/light.default.default.standard.aria.yml",
        console: "flows/one/desktop/01-only/light.default.default.standard.console.json",
        network: "flows/one/desktop/01-only/light.default.default.standard.network.json",
        frame: "flows/one/desktop/01-only/light.default.default.standard.png",
      },
    })
    expect(
      files.has("/run/flows/one/desktop/01-only/light.default.default.standard.dom.html"),
    ).toBe(true)
  })

  it("turns layout facts, overflow, overlays, and focus into findings", async () => {
    const box = { x: 0, y: 0, width: 10, height: 10 }
    let measured = 0
    const { session } = fakeSession({
      measureLayout: async () => ({
        ...EMPTY_FACTS,
        tracked: [{ key: "0", name: "hero", box: { ...box, y: measured++ === 0 ? 0 : 40 } }],
      }),
      horizontalOverflow: async () => 12,
      overlaysOutsideViewport: async () => ["dialog leaves the viewport"],
      focusProblems: async () => ["the focus ring is hidden"],
    })
    const { run } = memoryRun()
    const flow = defineFlow({
      name: "one",
      checkpoints: [checkpoint("only", { checks: { focus: true } })],
    })
    const [mobile] = expandFlowMatrix({ ...MATRIX_ONE, devices: ["mobile"] })
    if (mobile === undefined) throw new Error("no mobile plan")
    const report = await runFlowOnDevice({ flow, plan: mobile, session, run, mode: "assert" })
    expect(report.checkpoints[0]?.variants[0]?.findings.map((finding) => finding.check)).toEqual([
      "layout-shift",
      "reflow",
      "overlay",
      "focus",
    ])
  })

  it("keeps a finding the checkpoint allows, with its reason, out of the failures", async () => {
    const { session } = fakeSession({ scanAxe: async () => ["region: 1 node"] })
    const { run } = memoryRun()
    const flow = defineFlow({
      name: "one",
      checkpoints: [
        checkpoint("only", { allow: [{ check: "axe", match: /^region/, reason: "demo banner" }] }),
      ],
    })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "assert" })
    expect(report.status).toBe("pass")
    expect(report.checkpoints[0]?.variants[0]).toMatchObject({
      status: "pass",
      findings: [],
      allowed: [{ check: "axe", message: "region: 1 node", reason: "demo banner" }],
    })
  })

  it("judges an allowance against every finding, then caps what still fails", async () => {
    const violations = Array.from({ length: 14 }, (_, index) => `region: node ${index}`)
    const flow = (allow: FlowCheckpoint["allow"]) =>
      defineFlow({
        name: "one",
        checkpoints: [checkpoint("only", allow === undefined ? {} : { allow })],
      })
    const allowed = await runFlowOnDevice({
      flow: flow([{ check: "axe", match: /^region: node/, reason: "demo banner" }]),
      plan: desktop,
      session: fakeSession({ scanAxe: async () => violations }).session,
      run: memoryRun().run,
      mode: "assert",
    })
    expect(allowed.status).toBe("pass")
    const failing = await runFlowOnDevice({
      flow: flow(undefined),
      plan: desktop,
      session: fakeSession({ scanAxe: async () => violations }).session,
      run: memoryRun().run,
      mode: "assert",
    })
    const findings = failing.checkpoints[0]?.variants[0]?.findings ?? []
    expect(findings).toHaveLength(11)
    expect(findings.at(-1)?.message).toBe("…and 4 more axe findings")
  })

  it("reports runtime errors and a missed hydration against the checkpoint that raised them", async () => {
    const fake = fakeSession({
      waitHydrated: async () => false,
      act: async () => void fake.errors.push({ kind: "pageerror", message: "boom" }),
    })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({
      flow,
      plan: desktop,
      session: fake.session,
      run,
      mode: "assert",
    })
    expect(report.checkpoints[0]).toMatchObject({
      status: "fail",
      findings: [
        { check: "hydration", message: expect.stringContaining("did not hydrate") },
        { check: "runtime", message: "pageerror: boom" },
      ],
      evidence: { dom: "flows/one/desktop/01-only/checkpoint.dom.html" },
    })
  })

  it("stops at an unmet ready condition, skips the rest, and keeps the evidence", async () => {
    const { session, calls } = fakeSession({
      waitReady: async (checkpoint) => checkpoint.name !== "new-task",
    })
    const { run } = memoryRun()
    const flow = defineFlow({
      name: "create-task",
      checkpoints: [checkpoint("board"), checkpoint("new-task"), checkpoint("saved")],
    })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "capture" })
    expect(report.status).toBe("error")
    expect(report.error).toMatchObject({ kind: "readiness" })
    expect(report.checkpoints.map((item) => item.status)).toEqual(["pass", "error", "skipped"])
    expect(report.checkpoints[1]).toMatchObject({
      error: { kind: "readiness", message: expect.stringContaining('"new-task"') },
      evidence: { frame: "flows/create-task/desktop/02-new-task/checkpoint.png" },
      variants: [],
    })
    expect(calls).not.toContain("act:saved")
  })

  it("reports a frame that never settles as an unstable-frame error", async () => {
    let shot = 0
    const { session } = fakeSession({ screenshot: async () => Uint8Array.of(shot++) })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "capture" })
    expect(report.error).toMatchObject({ kind: "unstable-frame" })
  })

  it("maps a thrown action to an action error and a crashed measurement to a session error", async () => {
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const acting = fakeSession({
      act: async () => {
        throw new Error("locator not found")
      },
    })
    const measuring = fakeSession({
      scanAxe: async () => {
        throw new Error("Target page closed")
      },
    })
    const first = await runFlowOnDevice({
      flow,
      plan: desktop,
      session: acting.session,
      run: memoryRun().run,
      mode: "assert",
    })
    const second = await runFlowOnDevice({
      flow,
      plan: desktop,
      session: measuring.session,
      run: memoryRun().run,
      mode: "assert",
    })
    expect(first.error).toMatchObject({
      kind: "action",
      message: expect.stringContaining("locator not found"),
    })
    expect(second.error).toMatchObject({
      kind: "session",
      message: expect.stringContaining("Target page closed"),
    })
    expect(measuring.calls).toContain("restore")
  })

  it("times out a step that never settles", async () => {
    const { session } = fakeSession({ act: () => new Promise<void>(() => undefined) })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({
      flow,
      plan: desktop,
      session,
      run,
      mode: "assert",
      timeouts: { action: 5 },
    })
    expect(report.error).toMatchObject({ kind: "timeout", message: expect.stringContaining("5ms") })
  })

  it("stops on cancellation without collecting evidence", async () => {
    const controller = new AbortController()
    const { session } = fakeSession({
      act: async () => controller.abort(new Error("stop")),
      evidence: async () => {
        throw new Error("evidence must not be collected after a cancel")
      },
    })
    const { run } = memoryRun()
    const report = await runFlowOnDevice({
      flow: twoStep,
      plan: desktop,
      session,
      run,
      mode: "assert",
      signal: controller.signal,
    })
    expect(report.error).toMatchObject({ kind: "aborted" })
    expect(report.checkpoints.map((item) => item.status)).toEqual(["error", "skipped"])
    expect(report.checkpoints[0]?.evidence).toBeUndefined()
  })

  it("keeps the original error when collecting evidence also fails", async () => {
    const { session } = fakeSession({
      waitReady: async () => false,
      evidence: async () => {
        throw new Error("page crashed")
      },
    })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "assert" })
    expect(report.error?.kind).toBe("readiness")
    expect(report.error?.message).toMatch(/evidence unavailable: .*page crashed/)
  })

  it("reports missing checkpoint evidence next to the findings that asked for it", async () => {
    const { session } = fakeSession({
      waitHydrated: async () => false,
      evidence: async () => {
        throw new Error("page crashed")
      },
    })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({ flow, plan: desktop, session, run, mode: "assert" })
    const [only] = report.checkpoints
    expect(only?.evidence).toBeUndefined()
    expect(only?.findings).toContainEqual({
      check: "runtime",
      message: expect.stringMatching(/evidence unavailable: .*page crashed/),
    })
  })

  it("keeps a failing variant's findings when its evidence cannot be collected", async () => {
    const { session } = fakeSession({
      scanAxe: async () => ["color-contrast: 2 nodes"],
      evidence: async () => {
        throw new Error("page crashed")
      },
    })
    const { run } = memoryRun()
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const plan = expandFlowMatrix(MATRIX_ONE)[0]
    if (plan === undefined) throw new Error("no plan")
    const report = await runFlowOnDevice({ flow, plan, session, run, mode: "assert" })
    expect(report.status).toBe("fail")
    expect(report.error).toBeUndefined()
    expect(report.checkpoints[0]?.variants[0]).toMatchObject({
      status: "fail",
      findings: [
        { check: "runtime", message: expect.stringContaining("evidence unavailable") },
        { check: "axe", message: "color-contrast: 2 nodes" },
      ],
    })
  })

  it("aborts the signal a step's work holds once its budget runs out", async () => {
    let held: AbortSignal | undefined
    const { session } = fakeSession({
      act: (_checkpoint, signal) => {
        held = signal
        return new Promise<void>(() => undefined)
      },
    })
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({
      flow,
      plan: desktop,
      session,
      run: memoryRun().run,
      mode: "assert",
      timeouts: { action: 5 },
    })
    expect(report.error?.kind).toBe("timeout")
    expect(held?.aborted).toBe(true)
  })

  it("aborts evidence captures and writes once the evidence budget runs out", async () => {
    let held: AbortSignal | undefined
    const { session } = fakeSession({
      waitReady: async () => false,
      evidence: (signal) => {
        held = signal
        return new Promise(() => undefined)
      },
    })
    const flow = defineFlow({ name: "one", checkpoints: [checkpoint("only")] })
    const report = await runFlowOnDevice({
      flow,
      plan: desktop,
      session,
      run: memoryRun().run,
      mode: "assert",
      timeouts: { step: 5 },
    })
    expect(report.error?.message).toMatch(/evidence unavailable: evidence timed out after 5ms/)
    expect(held?.aborted).toBe(true)
  })
})

const MATRIX_ONE = {
  devices: ["desktop"],
  modes: ["light"],
  themes: "default",
  densities: "default",
  preferences: ["standard"],
  sampling: "all",
} as const
