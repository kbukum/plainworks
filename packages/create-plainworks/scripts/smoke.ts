// End-to-end smoke for the initializer: pack the workspace `@plainworks/*` packages exactly as they
// would publish (through `plainworks-release pack`, the release workflow's packer), scaffold a
// project with the built `create-plainworks`, redirect the generated pinned deps to those local
// tarballs, then install it and run the starter's own gates — typecheck, build, a boot probed over
// HTTP, and its Playwright browser suite. It proves the generated project works on its own, outside
// the monorepo, against the real published surfaces, without needing anything on npm. The CI
// `create-smoke` job runs this (after installing Chromium); it also runs locally. Everything
// happens in temp dirs; nothing in the repo is mutated.

import { execFileSync, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, "..")
const repoRoot = resolve(packageDir, "..", "..")
const packagesDir = join(repoRoot, "packages")

/** Run a command, inheriting stdio so failures surface in the CI log, and throw on a non-zero exit. */
function run(command: string, args: readonly string[], cwd: string): void {
  process.stdout.write(`$ ${command} ${args.join(" ")}  (cwd: ${cwd})\n`)
  execFileSync(command, args, { cwd, stdio: "inherit" })
}

/**
 * Pack a workspace exactly as the release workflow publishes it and return the tarball path. The
 * release tool resolves `workspace:`/`catalog:` ranges and applies `publishConfig`.
 */
function pack(dir: string, destination: string): string {
  const releaseTool = join(repoRoot, "node_modules", ".bin", "plainworks-release")
  process.stdout.write(`$ plainworks-release pack ${dir} --destination ${destination}\n`)
  const printed = execFileSync(releaseTool, ["pack", dir, "--destination", destination], {
    encoding: "utf8",
  })
  const tarball = printed.trim().split("\n").at(-1)
  if (tarball === undefined || !tarball.endsWith(".tgz")) {
    throw new Error(`plainworks-release pack printed no tarball for ${dir}`)
  }
  return tarball
}

/** Every published `@plainworks/*` package a generated app can depend on (excludes this initializer). */
interface PackageEntry {
  readonly name: string
  readonly dir: string
}

/** Parse a manifest just far enough to read its name and private flag. */
function readManifest(path: string): { readonly name?: unknown; readonly private?: unknown } {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (typeof parsed !== "object" || parsed === null) throw new Error(`${path} is not a JSON object`)
  return parsed
}

function publishablePackages(): PackageEntry[] {
  const entries: PackageEntry[] = []
  for (const name of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, name, "package.json")
    if (!existsSync(manifestPath)) continue
    const manifest = readManifest(manifestPath)
    if (manifest.private === true) continue
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@plainworks/")) continue
    entries.push({ name: manifest.name, dir: join(packagesDir, name) })
  }
  return entries
}

/** Poll `url` until it answers, failing after the timeout so a wedged boot does not hang CI. */
async function waitForOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now())
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(5000, remaining)) })
      if (response.ok) return
    } catch {
      // Server not up yet — keep polling until the deadline.
    }
    await delay(1000)
  }
  throw new Error(`generated app did not answer at ${url} within ${timeoutMs}ms`)
}

/** Assert a `GET url` succeeds and its body contains `expected`. */
async function expectBody(url: string, expected: string, timeoutMs = 10000): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  const body = await response.text()
  if (!body.includes(expected))
    throw new Error(`GET ${url} body missing ${JSON.stringify(expected)}`)
}

/**
 * Walk a redirect chain by hand, carrying cookies like a browser so the server-side BFF handoff
 * (state/PKCE cookies out on `/login`, the session cookie back on the callback) actually
 * round-trips — `fetch`'s automatic redirects drop cookies, which would let a broken flow pass
 * unnoticed.
 */
async function fetchWithCookies(
  startUrl: string,
  maxRedirects = 10,
  timeoutMs = 10000,
): Promise<Response> {
  const jar = new Map<string, string>()
  let url = startUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
    const response = await fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(timeoutMs),
    })
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? ""
      const eq = pair.indexOf("=")
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url).toString()
      continue
    }
    return response
  }
  throw new Error(`too many redirects from ${startUrl}`)
}

/**
 * Boot the built generated app with `next start` and probe it over HTTP: the public overview
 * renders, the seeded mock backend serves task data, the gated route turns an unauthenticated
 * request away, and the full BFF login chain lands an authenticated browser on the gated page.
 * Proves the scaffolded app runs end to end — including its auth seam — not just builds.
 */
async function bootAndProbe(appDir: string): Promise<void> {
  const port = 3111
  const origin = `http://127.0.0.1:${port}`
  const server = spawn("bunx", ["next", "start", "-p", String(port)], {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      AUTH_REDIRECT_ORIGIN: origin,
      // A production boot needs a configured signing key; the app never mints one there.
      SESSION_SIGNING_KEY: randomBytes(32).toString("base64url"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  })
  try {
    await waitForOk(`${origin}/`, 60_000)
    await expectBody(`${origin}/`, "Overview")
    await expectBody(`${origin}/api/tasks?limit=1`, '"data"')

    const gated = await fetch(`${origin}/tasks`, { redirect: "manual" })
    if (gated.status !== 302 && gated.status !== 307) {
      throw new Error(`expected /tasks to redirect an unauthenticated request, got ${gated.status}`)
    }

    const authed = await fetchWithCookies(`${origin}/login?returnTo=/tasks`)
    if (!authed.ok) throw new Error(`authenticated /tasks returned ${authed.status}`)
    const body = await authed.text()
    if (!body.includes("Tasks, highest priority first")) {
      throw new Error("authenticated Tasks page did not render the gated content")
    }
  } finally {
    server.kill("SIGTERM")
  }
}

const workspace = mkdtempSync(join(tmpdir(), "create-plainworks-smoke-"))
try {
  const packs = join(workspace, "packs")
  const projects = join(workspace, "projects")
  mkdirSync(packs, { recursive: true })
  mkdirSync(projects, { recursive: true })

  const packages = publishablePackages()

  // Build the initializer and every packable package, then pack each as a real publish would.
  const buildFilters = ["--filter=create-plainworks", ...packages.map((p) => `--filter=${p.name}`)]
  run("bunx", ["turbo", "run", "build", ...buildFilters], repoRoot)

  const overrides: Record<string, string> = {}
  for (const pkg of packages) overrides[pkg.name] = `file:${pack(pkg.dir, packs)}`

  // Pack the initializer itself into a tarball to prove its packaging includes examples/ and
  // exposes the bin properly when installed.
  const cliTarballPath = pack(packageDir, packs)

  // Install the packed initializer tarball in an isolated runner directory and execute its bin.
  const runnerDir = join(workspace, "cli-runner")
  mkdirSync(runnerDir, { recursive: true })
  writeFileSync(join(runnerDir, "package.json"), '{"name":"cli-runner","private":true}\n')
  run("bun", ["add", cliTarballPath], runnerDir)
  const cli = join(runnerDir, "node_modules", ".bin", "create-plainworks")
  run(cli, ["my-app", "--host", "next", "--no-install", "--no-git"], projects)

  const appDir = join(projects, "my-app")
  const manifestPath = join(appDir, "package.json")
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("generated package.json is not a JSON object")
  }
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, overrides }, null, 2)}\n`)

  run("bun", ["install"], appDir)
  run("bun", ["run", "typecheck"], appDir)
  run("bun", ["run", "build"], appDir)
  await bootAndProbe(appDir)
  run("bun", ["run", "e2e"], appDir)

  process.stdout.write(
    "\ncreate-plainworks smoke: generated app typechecked, built, booted, and passed its e2e ✓\n",
  )
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
