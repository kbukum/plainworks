import { describe, expect, it } from "vitest"
import type { FlowRun } from "../flow/report/artifacts"
import { type BaseCaptureSystem, closeAfter, createBaseCapture } from "./base-capture"
import { UiCaptureError } from "./errors"

const COMMIT = "0123456789abcdef0123"
const run = { dir: "/runs/base" } as FlowRun

interface FakeOptions {
  readonly stepCodes?: Readonly<Record<string, number>>
  readonly hostFails?: unknown
  readonly suite?: () => Promise<number>
  readonly stopFails?: unknown
  readonly removeFails?: unknown
  readonly worktreeRemoveFails?: unknown
}

function fakeSystem(options: FakeOptions = {}) {
  const calls: string[] = []
  const logs: string[] = []
  const suiteEnvs: Readonly<Record<string, string>>[] = []
  const system: BaseCaptureSystem = {
    repoRoot: async () => "/repo",
    createWorktreeDir: async () => "/tmp/base-1",
    prepareRunDir: async (dir) => {
      calls.push(`mkdir ${dir}`)
    },
    git: async (args) => {
      calls.push(`git ${args.join(" ")}`)
      if (args[1] === "remove" && options.worktreeRemoveFails !== undefined) {
        throw options.worktreeRemoveFails
      }
      return ""
    },
    removeDir: async (path) => {
      calls.push(`rm ${path}`)
      if (options.removeFails !== undefined) throw options.removeFails
    },
    runStep: async (command, args, step) => {
      calls.push(`${command} ${args[0]} @${step.cwd}`)
      return options.stepCodes?.[`${command} ${args[0]}`] ?? 0
    },
    startHost: async (cwd) => {
      calls.push(`host ${cwd}`)
      if (options.hostFails !== undefined) throw options.hostFails
      return {
        origin: "http://127.0.0.1:4100",
        stop: async () => {
          calls.push("host stop")
          if (options.stopFails !== undefined) throw options.stopFails
        },
        restart: async () => {},
      }
    },
    runSuite: async (invocation) => {
      calls.push(`suite workers=${invocation.workers}`)
      suiteEnvs.push(invocation.env)
      return (options.suite ?? (async () => 0))()
    },
    appendLog: async (_path, text) => {
      logs.push(text)
    },
  }
  return { system, calls, logs, suiteEnvs }
}

const capture = (system: BaseCaptureSystem, signal = new AbortController().signal) =>
  createBaseCapture(
    { app: "@demo/app", appDir: "apps/demo" },
    system,
    signal,
  )({
    commit: COMMIT,
    run,
    env: { FLOWS: "all" },
  })

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection")
    },
    (cause: unknown) => cause,
  )
}

describe("createBaseCapture", () => {
  it("builds the base in a detached worktree, runs the suite against its host, and cleans up", async () => {
    const { system, calls, suiteEnvs } = fakeSystem()
    await capture(system)
    expect(calls).toEqual([
      "mkdir /runs/base",
      `git worktree add --detach /tmp/base-1 ${COMMIT}`,
      "bun install @/tmp/base-1",
      "bunx turbo @/tmp/base-1",
      "host /tmp/base-1/apps/demo",
      "suite workers=1",
      "host stop",
      "git worktree remove --force /tmp/base-1",
      "rm /tmp/base-1",
    ])
    expect(suiteEnvs[0]).toMatchObject({
      FLOWS: "all",
      PLAINWORKS_GATE_ORIGIN: "http://127.0.0.1:4100",
    })
  })

  it("records a failing suite at the base without failing the capture", async () => {
    const { system, logs } = fakeSystem({ suite: async () => 1 })
    await capture(system)
    expect(logs).toEqual(["Playwright exited with 1\n"])
  })

  it("fails a step as a base error naming the commit, and still removes the worktree", async () => {
    const { system, calls } = fakeSystem({ stepCodes: { "bun install": 1 } })
    const cause = await rejection(capture(system))
    expect(cause).toBeInstanceOf(UiCaptureError)
    expect((cause as UiCaptureError).kind).toBe("base")
    expect((cause as Error).message).toContain("bun install failed at 0123456789ab")
    expect(calls).not.toContain("host /tmp/base-1/apps/demo")
    expect(calls.slice(-2)).toEqual(["git worktree remove --force /tmp/base-1", "rm /tmp/base-1"])
  })

  it("wraps a host that never starts as a base error with its cause", async () => {
    const boom = new Error("port busy")
    const { system } = fakeSystem({ hostFails: boom })
    const cause = (await rejection(capture(system))) as UiCaptureError
    expect(cause.kind).toBe("base")
    expect(cause.cause).toBe(boom)
  })

  it("keeps both the suite crash and the host stop failure", async () => {
    const crash = new Error("suite crashed")
    const stop = new Error("stop failed")
    const { system } = fakeSystem({ suite: () => Promise.reject(crash), stopFails: stop })
    const cause = await rejection(capture(system))
    expect(cause).toBeInstanceOf(AggregateError)
    expect((cause as AggregateError).errors).toEqual([crash, stop])
  })

  it("joins cleanup failures with the failure that started them", async () => {
    const crash = new Error("suite crashed")
    const removal = new Error("worktree locked")
    const { system } = fakeSystem({
      suite: () => Promise.reject(crash),
      worktreeRemoveFails: removal,
    })
    const cause = (await rejection(capture(system))) as UiCaptureError
    expect(cause.kind).toBe("base")
    expect(cause.message).toContain("/tmp/base-1")
    expect((cause.cause as AggregateError).errors).toEqual([crash, removal])
  })

  it("reports a cleanup failure on its own after a clean capture", async () => {
    const removal = new Error("disk full")
    const { system } = fakeSystem({ removeFails: removal })
    const cause = (await rejection(capture(system))) as UiCaptureError
    expect((cause.cause as AggregateError).errors).toEqual([removal])
  })

  it("does nothing once cancelled", async () => {
    const { system, calls } = fakeSystem()
    const controller = new AbortController()
    controller.abort(new Error("stop"))
    await expect(capture(system, controller.signal)).rejects.toThrow("stop")
    expect(calls).toEqual([])
  })
})

describe("closeAfter", () => {
  it("returns the result and closes once", async () => {
    let closed = 0
    await expect(
      closeAfter(
        async () => 7,
        async () => {
          closed++
        },
      ),
    ).resolves.toBe(7)
    expect(closed).toBe(1)
  })

  it("keeps the run's failure when close also fails", async () => {
    const failure = new Error("run failed")
    const close = new Error("close failed")
    const cause = await rejection(
      closeAfter(
        () => Promise.reject(failure),
        () => Promise.reject(close),
      ),
    )
    expect(cause).toBeInstanceOf(AggregateError)
    expect((cause as AggregateError).errors).toEqual([failure, close])
  })

  it("rethrows the run's failure after a clean close", async () => {
    const failure = new Error("run failed")
    await expect(
      closeAfter(
        () => Promise.reject(failure),
        async () => {},
      ),
    ).rejects.toBe(failure)
  })

  it("surfaces a close failure after a successful run", async () => {
    const close = new Error("close failed")
    await expect(
      closeAfter(
        async () => 1,
        () => Promise.reject(close),
      ),
    ).rejects.toBe(close)
  })
})
