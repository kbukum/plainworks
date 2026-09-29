import { isDeepStrictEqual } from "node:util"
import { isRecord } from "@plainworks/std"
import { COVERAGE_FLOOR, SOURCE_CONDITION } from "@plainworks/vitest-config"
import type { WorkspaceFacts } from "../inspect"
import { manifestProfile, typecheckProjects } from "./manifest"

type PackageFacts = Extract<WorkspaceFacts, { kind: "package" }>

/** One way a workspace breaks its profile. */
export interface ShapeIssue {
  readonly dir: string
  readonly message: string
}

const SYNC_HINT = "run `bun run sync-shape`"

/** Lists every way `facts` breaks its profile, in a stable order. */
export function checkWorkspace(facts: WorkspaceFacts): ShapeIssue[] {
  const messages = [
    ...manifestDrift(facts),
    ...tsconfigIssues(facts),
    ...(facts.kind === "package" ? libIssues(facts) : []),
    ...(facts.kind === "package" ? entryIssues(facts) : []),
    ...vitestIssues(facts),
    ...(facts.kind === "tool" ? toolIssues(facts) : []),
    ...(facts.kind === "app" ? appIssues(facts) : []),
  ]
  return messages.map((message) => ({ dir: facts.dir, message }))
}

function manifestDrift(facts: WorkspaceFacts): string[] {
  const profile = manifestProfile(facts)
  const { manifest } = facts
  const scripts = isRecord(manifest.scripts) ? manifest.scripts : {}
  const devDependencies = isRecord(manifest.devDependencies) ? manifest.devDependencies : {}
  return [
    ...Object.entries(profile.fields)
      .filter(([field, value]) => !isDeepStrictEqual(manifest[field], value))
      .map(([field]) => `package.json "${field}" does not match the profile; ${SYNC_HINT}`),
    ...Object.entries(profile.scripts)
      .filter(([name, command]) => scripts[name] !== command)
      .map(([name]) => `package.json script "${name}" does not match the profile; ${SYNC_HINT}`),
    ...Object.entries(profile.devDependencies)
      .filter(([name, range]) => devDependencies[name] !== range)
      .map(([name]) => `package.json devDependency "${name}" is missing; ${SYNC_HINT}`),
  ]
}

function tsconfigIssues(facts: WorkspaceFacts): string[] {
  const issues: string[] = []
  const solution = facts.tsconfigs.get("tsconfig.json")
  const projects = typecheckProjects(facts)
  if (facts.kind === "tool" && solution?.extends !== "../../tsconfig.tool.json") {
    issues.push("tsconfig.json must extend ../../tsconfig.tool.json")
  }
  if (facts.kind === "app" && solution?.extends !== "../../tsconfig.app.json") {
    issues.push("tsconfig.json must extend ../../tsconfig.app.json")
  }
  if (projects.length > 0) {
    const expected = projects.map((project) => `./${project}`)
    const references = Array.isArray(solution?.references) ? solution.references : []
    const actual = references.map((reference) => (isRecord(reference) ? reference.path : undefined))
    if (!isDeepStrictEqual(actual, expected)) {
      issues.push(`tsconfig.json must reference ${expected.join(", ")}`)
    }
  }
  for (const [name, config] of facts.tsconfigs) {
    const options = isRecord(config.compilerOptions) ? config.compilerOptions : {}
    if (options.customConditions !== undefined) {
      issues.push(
        `${name} overrides customConditions; the shared config owns how @plainworks/* resolves`,
      )
    }
    if (options.paths !== undefined && !isVendoredAlias(facts, options.paths)) {
      issues.push(
        `${name} declares paths; @plainworks/* resolves through the source export condition`,
      )
    }
  }
  return issues
}

// The projects that compile what a package ships from `.` and `./client`. Adapter, test, testing,
// and tooling projects may add the DOM lib; these may only in a package that declares `dom`.
const SHIPPED_PROJECTS = new Set(["tsconfig.json", "tsconfig.src.json", "tsconfig.client.json"])

function libIssues(facts: PackageFacts): string[] {
  if (facts.build.dom === true) return []
  return [...facts.tsconfigs]
    .filter(([name, config]) => SHIPPED_PROJECTS.has(name) && addsDomLib(config))
    .map(
      ([name]) =>
        `${name} adds the DOM lib; a package without \`dom\` keeps DOM to its adapter, test, and tooling projects`,
    )
}

function addsDomLib(config: Record<string, unknown>): boolean {
  const options = isRecord(config.compilerOptions) ? config.compilerOptions : {}
  return (
    Array.isArray(options.lib) &&
    options.lib.some((lib) => typeof lib === "string" && lib.toUpperCase().startsWith("DOM"))
  )
}

const HOST_SEGMENTS = new Set(["dom", "browser", "node"])

// testkit's `browser` entry is the one host-named entry: its real-browser harness.
const HOST_NAMED_ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "@plainworks/testkit": ["browser"],
}

function entryIssues(facts: PackageFacts): string[] {
  const allowed = HOST_NAMED_ENTRIES[String(facts.manifest.name)] ?? []
  const issues = Object.keys(facts.build.entry)
    .filter((key) => !allowed.includes(key))
    .filter((key) => key.split("/").some((segment) => HOST_SEGMENTS.has(segment)))
    .map(
      (key) =>
        `entry "${key}" is named after a host; name an adapter after what it does (e.g. "web-storage")`,
    )
  // Testing helpers may lean on Node or the DOM, so they compile apart from the shipped graphs.
  if ("testing" in facts.build.entry && !facts.tsconfigs.has("tsconfig.testing.json")) {
    issues.push("the `testing` entry needs its own tsconfig.testing.json project")
  }
  return issues
}

// Vendored shadcn atoms import their siblings through the `@/` alias the shadcn CLI writes, so a
// package with vendored code keeps exactly that one alias.
function isVendoredAlias(facts: WorkspaceFacts, paths: unknown): boolean {
  return (
    facts.kind === "package" &&
    facts.build.vendored !== undefined &&
    isRecord(paths) &&
    isDeepStrictEqual(Object.keys(paths), ["@/*"])
  )
}

function vitestIssues(facts: WorkspaceFacts): string[] {
  const app = facts.kind === "app"
  const preset = app ? "appTestConfig" : "testConfig"
  const use = `use ${preset} from @plainworks/vitest-config`
  if (facts.vitestSource === undefined) return [`vitest.config.ts is missing; ${use}`]
  const imported = new RegExp(
    `import \\{[^}]*\\b${preset}\\b[^}]*\\} from "@plainworks/vitest-config"`,
  )
  if (!imported.test(facts.vitestSource)) return [`vitest.config.ts must ${use}`]
  const config = facts.vitestConfig
  if (!isRecord(config)) return [`vitest.config.ts must export a config object; ${use}`]
  const issues: string[] = []
  const resolvesSource = resolveConditions(config).includes(SOURCE_CONDITION)
  if (app && resolvesSource) {
    issues.push(`vitest.config.ts resolves @plainworks/* from source; an app tests dist, ${use}`)
  }
  if (!app && !resolvesSource) {
    issues.push(`vitest.config.ts does not resolve @plainworks/* from source; ${use}`)
  }
  if (!app && !holdsCoverageFloor(config)) {
    issues.push(
      `vitest.config.ts must hold v8 coverage at ${COVERAGE_FLOOR}% or above on every metric; ${use}`,
    )
  }
  return issues
}

function resolveConditions(config: Record<string, unknown>): unknown[] {
  const conditions = isRecord(config.resolve) ? config.resolve.conditions : undefined
  return Array.isArray(conditions) ? conditions : []
}

const COVERAGE_METRICS = ["lines", "functions", "branches", "statements"] as const

function holdsCoverageFloor(config: Record<string, unknown>): boolean {
  const coverage = isRecord(config.test) ? config.test.coverage : undefined
  if (!isRecord(coverage) || coverage.provider !== "v8") return false
  const { thresholds } = coverage
  return (
    isRecord(thresholds) &&
    COVERAGE_METRICS.every((metric) => {
      const threshold = thresholds[metric]
      return typeof threshold === "number" && threshold >= COVERAGE_FLOOR
    })
  )
}

// Code a tool may keep at its root, beside `src/`: its Vitest config and dotfile tool configs.
const TOOL_ROOT_CODE = new Set(["vitest.config.ts"])

// A tool runs from source, so its bin asks Bun for the source condition that maps each
// `@plainworks/*` import to `src`. Without it, an import resolves to a `dist` that may not exist.
const TOOL_SHEBANG = "#!/usr/bin/env -S bun --conditions=@plainworks/source"

function toolIssues(facts: WorkspaceFacts): string[] {
  const issues: string[] = []
  if (!facts.rootDirectories.includes("src"))
    issues.push("src/ is missing; a tool keeps its code in src/")
  for (const file of facts.rootFiles) {
    if (/\.[cm]?[jt]sx?$/.test(file) && !file.startsWith(".") && !TOOL_ROOT_CODE.has(file)) {
      issues.push(`${file} sits outside src/; a tool keeps its code in src/`)
    }
  }
  if (facts.rootDirectories.includes("test")) {
    issues.push("test/ holds tests; colocate them with the code in src/")
  }
  const cli = facts.readSource("cli.ts")
  if (cli !== undefined && cli.split("\n", 1)[0] !== TOOL_SHEBANG) {
    issues.push(`src/cli.ts must start with \`${TOOL_SHEBANG}\` so it runs from source`)
  }
  return issues
}

function appIssues(facts: WorkspaceFacts): string[] {
  const issues: string[] = []
  const scripts = isRecord(facts.manifest.scripts) ? facts.manifest.scripts : {}
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string" && command.includes("../../internal")) {
      issues.push(`script "${name}" calls ../../internal directly; call the tool's bin instead`)
    }
  }
  const dependencies = isRecord(facts.manifest.dependencies) ? facts.manifest.dependencies : {}
  if ("@plainworks/testkit" in dependencies) {
    issues.push("@plainworks/testkit is a runtime dependency; keep it in devDependencies")
  }
  return issues
}
