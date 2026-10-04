import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { createDeadline } from "@plainworks/std/resilience"
import { runOwnedCommand } from "@plainworks/testkit/playwright"

// Every command runs in its own released process group under a disposed deadline. Whatever the
// steps did (passed, failed, or timed out), the runner then inspects what is left, records it, and
// fails if any step failed or anything owned remains.

const SETUP_TIMEOUT_MS = 30_000
const STEP_TIMEOUT_MS = Number(process.env.SYSTEM_PROOF_STEP_TIMEOUT_MS ?? 180_000)

const root = mkdtempSync("/private/run-")
chmodSync(root, 0o700)
const file = (name: string): string => join(root, name)
const artifacts = resolve("internal/integration/.ui-artifacts/proof")
const integration = resolve("internal/integration")
const playwright = fileURLToPath(
  new URL("cli.js", import.meta.resolve("@playwright/test/package.json")),
)

type Outcome = "passed" | "failed" | "timed-out" | "skipped"
const outcomes: { step: string; outcome: Outcome; code?: number }[] = []
const failures: unknown[] = []
let deadlines = { created: 0, disposed: 0 }

const redact = (text: string): string =>
  text.replace(/[A-Za-z0-9_-]{43,}(?:\.[A-Za-z0-9_-]+)*/g, "[redacted]").slice(-65_536)

async function step(
  name: string,
  program: string,
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly cwd?: string; readonly print?: boolean },
): Promise<void> {
  if (failures.length > 0) {
    outcomes.push({ step: name, outcome: "skipped" })
    return
  }
  const deadline = createDeadline(options.timeoutMs)
  deadlines = { ...deadlines, created: deadlines.created + 1 }
  try {
    const result = await runOwnedCommand(program, args, {
      signal: deadline.signal,
      env,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    if (options.print === true) process.stdout.write(redact(result.output))
    if (result.code === 0) {
      outcomes.push({ step: name, outcome: "passed" })
    } else {
      outcomes.push({ step: name, outcome: "failed", code: result.code })
      failures.push(new Error(`${name} exited ${result.code}.\n${redact(result.output)}`))
    }
  } catch (error) {
    outcomes.push({ step: name, outcome: deadline.signal.aborted ? "timed-out" : "failed" })
    failures.push(error)
  } finally {
    deadline.dispose()
    deadlines = { ...deadlines, disposed: deadlines.disposed + 1 }
  }
}

const env: Record<string, string> = {
  NODE_EXTRA_CA_CERTS: file("ca.pem"),
  SYSTEM_PROOF_PRIVATE: root,
  SYSTEM_PROOF_NOW: new Date().toISOString(),
}
const setup = (name: string, program: string, args: readonly string[]): Promise<void> =>
  step(name, program, args, { timeoutMs: SETUP_TIMEOUT_MS })

await setup("openssl", "openssl", [
  "req",
  "-x509",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:P-256",
  "-noenc",
  "-keyout",
  file("ca-key.pem"),
  "-out",
  file("ca.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=plainworks disposable system CA",
  "-addext",
  "basicConstraints=critical,CA:TRUE,pathlen:0",
  "-addext",
  "keyUsage=critical,keyCertSign,cRLSign",
])
await setup("openssl", "openssl", [
  "req",
  "-new",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:P-256",
  "-noenc",
  "-keyout",
  file("localhost-key.pem"),
  "-out",
  file("localhost.csr"),
  "-subj",
  "/CN=localhost",
])
writeFileSync(
  file("leaf.ext"),
  [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
  ].join("\n"),
  { mode: 0o600 },
)
await setup("openssl", "openssl", [
  "x509",
  "-req",
  "-in",
  file("localhost.csr"),
  "-CA",
  file("ca.pem"),
  "-CAkey",
  file("ca-key.pem"),
  "-CAcreateserial",
  "-days",
  "1",
  "-extfile",
  file("leaf.ext"),
  "-out",
  file("localhost.pem"),
])
await setup("openssl", "openssl", [
  "req",
  "-x509",
  "-newkey",
  "ec",
  "-pkeyopt",
  "ec_paramgen_curve:P-256",
  "-noenc",
  "-keyout",
  file("untrusted-key.pem"),
  "-out",
  file("untrusted.pem"),
  "-days",
  "1",
  "-subj",
  "/CN=untrusted localhost",
  "-addext",
  "subjectAltName=DNS:localhost,IP:127.0.0.1",
])
if (failures.length === 0) for (const name of readdirSync(root)) chmodSync(file(name), 0o600)
const nss = "/home/pwuser/.pki/nssdb"
mkdirSync(nss, { recursive: true, mode: 0o700 })
await setup("certutil", "certutil", ["-N", "-d", `sql:${nss}`, "--empty-password"])
await setup("certutil", "certutil", [
  "-A",
  "-d",
  `sql:${nss}`,
  "-n",
  "plainworks-system-proof",
  "-t",
  "C,,",
  "-i",
  file("ca.pem"),
])

mkdirSync(artifacts, { recursive: true })

const browser = (name: string, args: readonly string[]): Promise<void> =>
  step(name, "node", [playwright, ...args], {
    timeoutMs: STEP_TIMEOUT_MS,
    cwd: integration,
    print: true,
  })
await browser("public browser proof", ["test", "--config", "playwright.config.ts"])
await browser("auth browser proof", ["test", "--config", "playwright.auth.config.ts"])
await step(
  "ui capture",
  "bun",
  ["src/system/ui-capture.ts", "--flow", "public-host-outage-recovery"],
  {
    timeoutMs: STEP_TIMEOUT_MS,
    cwd: integration,
    print: true,
  },
)
await step(
  "auth ui capture",
  "bun",
  ["src/system/auth-ui-capture.ts", "--flow", "opaque-session"],
  {
    timeoutMs: STEP_TIMEOUT_MS,
    cwd: integration,
    print: true,
  },
)

// Each step already released its own process group; a survivor here escaped that ownership.
const deadline = Date.now() + 1_000
let remaining: string[]
do {
  remaining = readdirSync("/proc").filter(
    (name) => /^\d+$/.test(name) && Number(name) !== 1 && Number(name) !== process.pid,
  )
  if (remaining.length === 0) break
  await setTimeout(25)
} while (Date.now() < deadline)
const listeners = ["/proc/net/tcp", "/proc/net/tcp6"].flatMap((path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .slice(1)
    .filter((line) => line.trim().split(/\s+/)[3] === "0A"),
).length
rmSync(root, { recursive: true, force: true })
writeFileSync(
  join(artifacts, "cleanup.json"),
  JSON.stringify({
    steps: outcomes,
    ownedProcesses: remaining.length,
    ownedListeners: listeners,
    deadlines,
    privateRoot: "removed",
    trust: "disposable-container-only",
  }),
  { mode: 0o600 },
)
if (remaining.length !== 0) {
  failures.push(new Error(`Owned process cleanup failed: ${remaining.join(", ")}`))
}
if (listeners !== 0) failures.push(new Error("Owned listener remains after the browser proof."))
if (deadlines.created !== deadlines.disposed) failures.push(new Error("A step deadline leaked."))
if (failures.length > 0) throw new AggregateError(failures, "System proof failed.")
