import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// Runs the real Playwright runner over `gate.spec.ts` and inspects what the gate owned afterwards:
// every worker's host process must be gone whether the run passed, failed, timed out, or was
// cancelled.

const playwright = join(import.meta.dirname, "../../node_modules/.bin/playwright")
const config = join(import.meta.dirname, "playwright.config.ts")
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const free = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)))
  })

async function basePort(): Promise<number> {
  for (let port = 20_000 + Math.floor(Math.random() * 20_000); ; port += 2) {
    if ((await free(port)) && (await free(port + 1))) return port
  }
}

interface Run {
  readonly code: number | null
  readonly output: string
  readonly data: string
  readonly statuses: readonly string[]
}

interface ReportTest {
  readonly results: readonly { readonly status: string }[]
}
interface ReportSuite {
  readonly specs?: readonly { readonly tests: readonly ReportTest[] }[]
  readonly suites?: readonly ReportSuite[]
}

const statuses = (suite: ReportSuite): string[] => [
  ...(suite.specs ?? []).flatMap((spec) =>
    spec.tests.flatMap((test) => test.results.map((result) => result.status)),
  ),
  ...(suite.suites ?? []).flatMap(statuses),
]

async function run(
  scenario: string,
  options: {
    workers?: number
    env?: Record<string, string>
    cancel?: "SIGINT" | "SIGTERM"
  } = {},
): Promise<Run> {
  const data = mkdtempSync(join(tmpdir(), "gate-"))
  dirs.push(data)
  const child = spawn(playwright, ["test", "-c", config, "gate.spec.ts"], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      GATE_DATA_DIR: data,
      GATE_SCENARIO: scenario,
      GATE_WORKERS: String(options.workers ?? 1),
      GATE_BASE_PORT: String(await basePort()),
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk))
  child.stderr.on("data", (chunk) => (output += chunk))
  if (options.cancel !== undefined) {
    const deadline = Date.now() + 30_000
    while (!existsSync(join(data, "hanging")) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    child.kill(options.cancel)
  }
  const code = await new Promise<number | null>((resolve) => child.once("close", resolve))
  const report = join(data, "report.json")
  const parsed = existsSync(report)
    ? statuses(JSON.parse(readFileSync(report, "utf8")) as ReportSuite)
    : []
  return { code, output, data, statuses: parsed }
}

const workers = (data: string): string[] =>
  readdirSync(data).filter((name) => name.startsWith("worker-"))

const alive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

async function expectReleased(data: string): Promise<void> {
  const deadline = Date.now() + 1_000
  for (const worker of workers(data)) {
    const pid = Number(readFileSync(join(data, worker, "pid"), "utf8"))
    while (alive(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(alive(pid), `${worker} host group ${pid}`).toBe(false)
  }
}

const events = (data: string, worker: string): string[] =>
  readFileSync(join(data, worker, "events"), "utf8")
    .trim()
    .split("\n")

describe("browser gate in the real Playwright runner", { timeout: 120_000 }, () => {
  it("gives each worker its own host and run ID, and each test a fresh context reset before sign-in", async () => {
    const result = await run("success", { workers: 2 })
    expect(result.code, result.output).toBe(0)
    expect(result.statuses).toEqual(Array(5).fill("passed"))
    const owned = workers(result.data)
    expect(owned).toHaveLength(2)
    for (const worker of owned) {
      const log = events(result.data, worker)
      // Every signed-in test resets first; the signed-out test only resets.
      for (const [index, event] of log.entries()) {
        if (event === "sign-in") expect(log[index - 1]).toBe("reset")
      }
    }
    const total = owned.flatMap((worker) => events(result.data, worker))
    expect(total.filter((event) => event === "reset")).toHaveLength(5)
    expect(total.filter((event) => event === "sign-in")).toHaveLength(4)
    await expectReleased(result.data)
  })

  it.each([
    ["sign-in-failure", "failed"],
    ["assertion-failure", "failed"],
    ["timeout", "timedOut"],
  ])("releases every host after %s", async (scenario, status) => {
    const result = await run(scenario)
    expect(result.code, result.output).toBe(1)
    expect(result.statuses.slice(0, 4)).toEqual(Array(4).fill(status))
    expect(workers(result.data)).not.toHaveLength(0)
    await expectReleased(result.data)
  })

  it.each(["SIGINT", "SIGTERM"] as const)("releases the host on runner %s", async (cancel) => {
    const result = await run("cancel", { cancel })
    expect(result.code, result.output).not.toBe(0)
    expect(workers(result.data)).toHaveLength(1)
    await expectReleased(result.data)
  })

  it("releases a starting host when the worker exits before readiness", async () => {
    const result = await run("startup-cancel", { cancel: "SIGINT" })
    expect(result.code, result.output).not.toBe(0)
    expect(workers(result.data)).toHaveLength(1)
    await expectReleased(result.data)
  })

  it("rejects sharing an external host across workers", async () => {
    const result = await run("success", {
      workers: 2,
      env: { PLAINWORKS_GATE_ORIGIN: "http://127.0.0.1:9" },
    })
    expect(result.code).toBe(1)
    expect(readFileSync(join(result.data, "report.json"), "utf8")).toContain(
      "An external/warm gate host requires exactly one worker.",
    )
    expect(workers(result.data)).toHaveLength(0)
  })
})
