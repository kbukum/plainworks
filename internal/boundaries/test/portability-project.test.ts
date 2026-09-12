import { readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { expect, test } from "vitest"

/**
 * Structural half of the portability gate. The sibling fixture test in `boundaries.test.ts` proves
 * the ES2023-only compile config *rejects* a neutral entry that names a DOM global. This test
 * proves the other half the step's "every package, fail closed" requirement needs: that every
 * package which claims host-independence is actually wired into that config and cannot silently opt
 * back out.
 *
 * A package declares itself host-independent by including the `types/universal-web.d.ts` shim in
 * its neutral (server `.`) project. The one bypass the compiler fixture can't catch is a package
 * that *does* include the shim yet re-adds the DOM lib (or Node/DOM `@types`) to its own
 * `tsconfig.json`: `document`/`window` would then typecheck and the gate would fail open for that
 * package alone. This reads each package's fully-resolved config (honoring `extends`) and forbids
 * exactly that. Packages that are deliberately host-bound dev tooling (e.g. `mocks`) opt into
 * `types: ["node"]` and do *not* include the shim, so they are correctly out of scope here rather
 * than needing an allowlist.
 */
const here = dirname(fileURLToPath(import.meta.url))
const packagesDir = resolve(here, "../../../packages")
const fixtures = resolve(here, "fixtures/portability")

const SHIM = "universal-web.d.ts"

/**
 * The packages that declare host-independence and must stay wired into the ES2023-only neutral
 * config. Listed explicitly so a package silently dropping the shim fails the gate (it would vanish
 * from the resolved-neutral set otherwise) rather than passing by omission — fail closed, like the
 * boundary map. Host-bound dev tooling (e.g. `mocks`, which opts into `types: ["node"]`) is not
 * here.
 */
const EXPECTED_NEUTRAL = [
  "std",
  "http",
  "state",
  "connect",
  "channel",
  "query",
  "testkit",
  "auth",
  "app",
] as const

interface NeutralProject {
  /** The package declares host-independence by pulling in the universal-web shim. */
  includesShim: boolean
  /** Resolved `lib` entries that leak a host surface (DOM / WebWorker) into the neutral project. */
  domLibs: string[]
  /**
   * Every resolved `types` entry. The base config pins `types: []`, so a neutral project's list
   * must stay empty: any entry (`node`, `dom`, but also `bun`, `jsdom`, …) reopens an ambient host
   * surface the exact-name check used to miss.
   */
  types: string[]
}

function inspectNeutralProject(tsconfigPath: string): NeutralProject {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      },
    },
  )
  // Derive shim inclusion from the fully-resolved file list, not the raw `include`, so a package
  // that inherits the shim through `extends` is still recognized — matching how `lib`/`types` are
  // read.
  const includesShim = (parsed?.fileNames ?? []).some((file) => file.includes(SHIM))
  const libs = parsed?.options.lib ?? []
  const types = parsed?.options.types ?? []
  return {
    includesShim,
    domLibs: libs.filter((lib) => /lib\.(dom|webworker)/i.test(lib)),
    types: [...types],
  }
}

function packageProjects(): { name: string; project: NeutralProject }[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      project: inspectNeutralProject(join(packagesDir, entry.name, "tsconfig.json")),
    }))
}

test("no host-independent package widens its neutral project to a DOM/Node surface", () => {
  const offenders = packageProjects()
    .filter(
      ({ project }) =>
        project.includesShim && (project.domLibs.length > 0 || project.types.length > 0),
    )
    .map(
      ({ name, project }) =>
        `@plainworks/${name}: lib=[${project.domLibs.join(", ")}] types=[${project.types.join(", ")}]`,
    )
  // Named, fail-closed like the boundary gate: an offender points at the exact package that
  // reopened the DOM surface on its own `.` project.
  expect(
    offenders,
    `these neutral projects reopened a host surface:\n${offenders.join("\n")}`,
  ).toEqual([])
})

test("every expected host-independent package keeps the shim and an empty types list", () => {
  const projects = new Map(packageProjects().map(({ name, project }) => [name, project]))
  // Fail closed: each declared-neutral package must still resolve the shim and keep `types: []`.
  // Removing the shim, or reopening a host surface via `types`, fails here rather than passing by
  // silently dropping out of the offender scan above.
  for (const name of EXPECTED_NEUTRAL) {
    const project = projects.get(name)
    expect(project, `@plainworks/${name} is missing a tsconfig.json`).toBeDefined()
    expect(project?.includesShim, `@plainworks/${name} dropped the universal-web shim`).toBe(true)
    expect(
      project?.types ?? [],
      `@plainworks/${name} reopened a host surface via types=[${project?.types.join(", ")}]`,
    ).toEqual([])
    expect(
      project?.domLibs ?? [],
      `@plainworks/${name} reopened a DOM lib=[${project?.domLibs.join(", ")}]`,
    ).toEqual([])
  }
})

test("the guard bites: a shim project that re-adds the DOM lib is flagged", () => {
  // Fixture proof the detector isn't a no-op: a project that includes the shim yet layers the DOM
  // lib back on must be reported as a leak, exactly what the per-package assertion forbids.
  const leak = inspectNeutralProject(join(fixtures, "tsconfig.dom-leak.json"))
  expect(leak.includesShim).toBe(true)
  expect(leak.domLibs.length).toBeGreaterThan(0)
})
