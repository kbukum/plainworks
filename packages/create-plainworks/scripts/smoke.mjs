// End-to-end smoke for the initializer: pack the workspace `@plainworks/*` packages exactly as they
// would publish (bun resolves `workspace:`/`catalog:` to concrete versions on pack), scaffold a
// project with the built `create-plainworks`, redirect the generated pinned deps to those local
// tarballs, then install, typecheck, build, and boot it — probing the running app over HTTP. It
// proves the generated manifest is well-formed and the app compiles AND runs against the real
// published surfaces, serving seeded data, without needing anything on npm. The CI `create-smoke`
// job runs this; it also runs locally. Everything happens in temp dirs; nothing in the repo is
// mutated.

import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, "..")
const repoRoot = resolve(packageDir, "..", "..")
const packagesDir = join(repoRoot, "packages")

/** Run a command, inheriting stdio so failures surface in the CI log, and throw on a non-zero exit. */
function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(" ")}  (cwd: ${cwd})`)
  execFileSync(command, args, { cwd, stdio: "inherit" })
}

/** Every published `@plainworks/*` package a generated app can depend on (excludes this initializer). */
function publishablePackages() {
  const entries = []
  for (const name of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, name, "package.json")
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (manifest.private === true) continue
    if (!String(manifest.name ?? "").startsWith("@plainworks/")) continue
    entries.push({ name: manifest.name, dir: join(packagesDir, name) })
  }
  return entries
}

/** Poll `url` until it answers, failing after the timeout so a wedged boot does not hang CI. */
async function waitForOk(url, timeoutMs) {
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
async function expectBody(url, expected, timeoutMs = 10000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
  const body = await response.text()
  if (!body.includes(expected)) throw new Error(`GET ${url} body missing ${JSON.stringify(expected)}`)
}

/**
 * Walk a redirect chain by hand, carrying cookies like a browser so the server-side BFF handoff
 * (state/PKCE cookies out on `/login`, the session cookie back on the callback) actually round-trips
 * — `fetch`'s automatic redirects drop cookies, which would let a broken flow pass unnoticed.
 */
async function fetchWithCookies(startUrl, maxRedirects = 10, timeoutMs = 10000) {
  const jar = new Map()
  let url = startUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
    const response = await fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(timeoutMs),
    })
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0]
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
 * Boot the built generated app with `next start` and probe it over HTTP: the public overview renders,
 * the seeded mock backend serves task data, the gated route turns an unauthenticated request away, and
 * the full BFF login chain lands an authenticated browser on the gated page. Proves the scaffolded app
 * runs end to end — including its auth seam — not just builds.
 */
async function bootAndProbe(appDir) {
  const port = 3111
  const origin = `http://127.0.0.1:${port}`
  const server = spawn("bunx", ["next", "start", "-p", String(port)], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, APP_ORIGIN: origin, AUTH_REDIRECT_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1" },
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

  // Build the initializer and every packable package, then pack each — `bun pm pack` rewrites
  // `workspace:`/`catalog:` to the concrete versions a real publish would ship.
  const buildFilters = ["--filter=create-plainworks", ...packages.map((p) => `--filter=${p.name}`)]
  run("bunx", ["turbo", "run", "build", ...buildFilters], repoRoot)

  const overrides = {}
  for (const pkg of packages) {
    const before = new Set(readdirSync(packs))
    run("bun", ["pm", "pack", "--destination", packs], pkg.dir)
    const created = readdirSync(packs).find((file) => !before.has(file) && file.endsWith(".tgz"))
    if (!created) throw new Error(`bun pm pack produced no tarball for ${pkg.name}`)
    overrides[pkg.name] = `file:${join(packs, created)}`
  }

  // Pack the initializer itself into a tarball to prove its packaging includes examples/ and
  // exposes the bin properly when installed.
  const beforeCli = new Set(readdirSync(packs))
  run("bun", ["pm", "pack", "--destination", packs], packageDir)
  const cliTarball = readdirSync(packs).find((file) => !beforeCli.has(file) && file.endsWith(".tgz"))
  if (!cliTarball) throw new Error("bun pm pack produced no tarball for create-plainworks")
  const cliTarballPath = join(packs, cliTarball)

  // Install the packed initializer tarball in an isolated runner directory and execute its bin.
  const runnerDir = join(workspace, "cli-runner")
  mkdirSync(runnerDir, { recursive: true })
  writeFileSync(join(runnerDir, "package.json"), '{"name":"cli-runner","private":true}\n')
  run("bun", ["add", cliTarballPath], runnerDir)
  const cli = join(runnerDir, "node_modules", ".bin", "create-plainworks")
  run(cli, ["my-app", "--host", "next", "--no-install", "--no-git"], projects)

  const appDir = join(projects, "my-app")
  const manifestPath = join(appDir, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  manifest.overrides = overrides
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  run("bun", ["install"], appDir)
  run("bun", ["run", "typecheck"], appDir)
  run("bun", ["run", "build"], appDir)
  await bootAndProbe(appDir)

  console.log("\ncreate-plainworks smoke: generated app installed, typechecked, built, and booted ✓")
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
