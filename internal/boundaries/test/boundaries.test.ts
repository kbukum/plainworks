import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { cruise } from "dependency-cruiser"
import { expect, test } from "vitest"

// The `.cjs` config is the exact ruleset the gate ships; import it so the test can never drift
// from what runs in CI.
const require = createRequire(import.meta.url)
const config = require("../.dependency-cruiser.cjs") as {
  forbidden: import("dependency-cruiser").IForbiddenRuleType[]
  options: import("dependency-cruiser").IConfiguration["options"]
}

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(here, "fixtures")

type Violation = { rule: { name: string }; from: string; to: string }

async function cruiseFixtures(): Promise<Violation[]> {
  // Cruise with the shipped options so a regression in includeOnly/tsConfig/resolver settings
  // fails here too instead of leaving the real gate vacuously green. The one override: the
  // shipped `exclude` hides this test's own fixture directory, so it is narrowed to node_modules.
  const result = await cruise([fixtures], {
    ...config.options,
    exclude: { path: "node_modules" },
    ruleSet: { forbidden: config.forbidden },
    validate: true,
  })
  const output = typeof result.output === "string" ? JSON.parse(result.output) : result.output
  return output.summary.violations as Violation[]
}

/**
 * Proves the gate actually bites, in both directions. The fixtures contain the five ways to break
 * the layer model — an upward import (`std` L0 -> `auth` L3), a same-layer import (`state` L1 ->
 * `ui` L1), an unmapped package reaching into another package, a mapped package reaching into an
 * unmapped one (`state` -> `rogue`), and a package reaching up into app code — plus the legal
 * cases (higher -> lower, intra-package) that must stay green. Without this, a repo with zero
 * feature packages would leave the gate vacuously green, and a reversed layer comparison or
 * over-broad regex could pass unnoticed.
 */
test("layer violations trip the gate", async () => {
  const violations = await cruiseFixtures()
  const tripped = new Set(violations.map((v) => v.rule.name))

  // std (L0) illegally importing auth (L3).
  expect(tripped.has("no-upward-std")).toBe(true)
  expect(tripped.has("std-is-zero-dep")).toBe(true)
  // state (L1) illegally importing ui (also L1) — sideways is as forbidden as upward.
  expect(tripped.has("no-upward-state")).toBe(true)
  // A package with no entry in the LAYERS map may not import any @plainworks package (fail-closed).
  expect(tripped.has("unmapped-package-no-internal-imports")).toBe(true)
  // ...and a mapped package may not import an unmapped one — the same hole, other direction.
  expect(tripped.has("no-mapped-to-unmapped")).toBe(true)
  // A package may not reach up into apps/ or internal/ tooling.
  expect(tripped.has("no-package-into-apps-or-internal")).toBe(true)
})

/**
 * Token-custody quarantine. auth's server-only custody graph holds the session-signing secret, so a
 * `"use client"` graph must never import it. The rule is path-based (dependency-cruiser can't read
 * a `"use client"` directive), so the fixture is a client-graph module (`auth/src/client/guard.ts`)
 * importing the server graph (`auth/src/server/hmac-signer.ts`) — the edge that must trip the rule,
 * proving the secret cannot slip into a browser bundle.
 */
test("a client graph importing auth server-only custody trips the quarantine rule", async () => {
  const violations = await cruiseFixtures()
  const tripped = violations.find(
    (v) =>
      v.rule.name === "no-client-into-auth-server" &&
      v.from.endsWith("auth/src/client/guard.ts") &&
      v.to.endsWith("auth/src/server/hmac-signer.ts"),
  )
  expect(tripped).toBeDefined()
})

/**
 * Custody ownership — the transitive half of the quarantine. A neutral (non-server) auth module
 * reaching into `server/**` must trip `no-nonserver-into-auth-server`, proving the signing secret
 * is reachable only through auth's own server entry — so a client importing the neutral `.` barrel
 * can never pull custody in by a longer path.
 */
test("a neutral auth module importing server-only custody trips the ownership rule", async () => {
  const violations = await cruiseFixtures()
  const tripped = violations.find(
    (v) =>
      v.rule.name === "no-nonserver-into-auth-server" &&
      v.from.endsWith("auth/src/neutral-custody-leak.ts") &&
      v.to.endsWith("auth/src/server/hmac-signer.ts"),
  )
  expect(tripped).toBeDefined()
})

test("legal higher-to-lower imports are allowed", async () => {
  const violations = await cruiseFixtures()
  // `auth` (L3) -> `std` (L0) is the layer model working as intended; no rule may flag it.
  const downward = violations.find((v) => v.from.endsWith("auth/src/index.ts"))
  expect(downward).toBeUndefined()
})

/**
 * The @plainworks/app composition kernel is `ui`-free (app-F3). `ui` (L1) sits *below* `app` (L4),
 * so the layer model permits app -> ui as a legal downward import — this charter rule forbids it
 * anyway, keeping the kernel host-neutral and buildable before `ui` exists. The fixture is an app
 * module importing the `ui` stand-in; only `no-app-into-ui` may flag it.
 */
test("the app kernel importing ui trips the ui-free rule", async () => {
  const violations = await cruiseFixtures()
  const appToUi = violations.filter((v) => v.from.endsWith("app/src/ui-leak.ts"))
  expect(appToUi.map((v) => v.rule.name)).toEqual(["no-app-into-ui"])
})

test("intra-package (self) imports are allowed", async () => {
  const violations = await cruiseFixtures()
  // `rogue/src/index.ts -> rogue/src/util.ts` is a legal same-package import; no rule may flag it.
  const selfImport = violations.find(
    (v) => v.from.endsWith("rogue/src/index.ts") && v.to.endsWith("rogue/src/util.ts"),
  )
  expect(selfImport).toBeUndefined()
})

test("import cycles trip the no-circular rule", async () => {
  const violations = await cruiseFixtures()
  // `cycle/a` <-> `cycle/b` is a real two-module import cycle; the layer-and-cycle gate must fire.
  const tripped = new Set(violations.map((v) => v.rule.name))
  expect(tripped.has("no-circular")).toBe(true)
})

/**
 * The one deliberate upward exception: test files may import @plainworks/testkit (shared fakes),
 * but production source may not. Both halves are proven from fixtures so a regression in the
 * carve-out — either forbidding a legitimate test import or letting production pull in test tooling
 * — fails here.
 */
test("test files may import testkit, but production source may not", async () => {
  const violations = await cruiseFixtures()
  // The production edge (`state/src/uses-testkit.ts` -> testkit) must trip the dedicated rule...
  const production = violations.find(
    (v) =>
      v.from.endsWith("state/src/uses-testkit.ts") &&
      v.rule.name === "no-production-testkit-import",
  )
  expect(production).toBeDefined()
  // ...while the test-file edge (`state/src/uses-testkit.test.ts` -> testkit) must trip no rule.
  const testEdge = violations.find((v) => v.from.endsWith("state/src/uses-testkit.test.ts"))
  expect(testEdge).toBeUndefined()
})

/**
 * The whole TS-AST toolchain (dependency-cruiser) can only parse on the TypeScript 6 Compiler API.
 * If someone bumps the catalog `typescript` to 7, dependency-cruiser silently stops extracting
 * dependencies and every layer rule goes green for the wrong reason. This asserts the catalog stays
 * on TS 6 so that bump fails loudly here instead of quietly disabling the gate.
 */
test("catalog typescript stays on the TS6 line so the boundary gate keeps parsing", () => {
  const root = JSON.parse(readFileSync(resolve(here, "../../../package.json"), "utf8"))
  const range: string = root.catalog.typescript
  // Assert the complete range, not just its first number: `^6.0.3 || ^7.0.0` or `>=6.0.3` would
  // admit TS7 while a first-number check stays green.
  expect(
    range,
    `catalog typescript is "${range}"; the layer gate only runs on TS6 - see docs/architecture.md Governance before raising it`,
  ).toMatch(/^\^6\.\d+\.\d+$/)
})

/**
 * The portability gate is the shared ES2023-only compile config (`tsconfig.base.json`: no DOM/Node
 * lib, `types: []`) plus the explicit `types/universal-web.d.ts` global shim — enforced at
 * `typecheck` on every package, not a dependency-cruiser rule. These fixtures prove it bites in
 * both directions using the real compiler (no regex heuristic): a neutral entry touching only the
 * universal Web value globals compiles, while one reaching for a DOM-only global (`document`)
 * fails.
 */
function typechecksUnderGate(project: string): { ok: boolean; output: string } {
  const cwd = resolve(fixtures, "portability")
  try {
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", project], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { ok: true, output: "" }
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}` }
  }
}

// A real `tsc -p` cold start takes several seconds on a CI runner, so these two tests get a
// process-scale timeout instead of Vitest's 5s default.
const TSC_TIMEOUT_MS = 60_000

test("the portability gate compiles a neutral entry using only universal Web globals", {
  timeout: TSC_TIMEOUT_MS,
}, () => {
  expect(typechecksUnderGate("tsconfig.ok.json").ok).toBe(true)
})

test("the portability gate compiles the server-only entry host-free (TextEncoder/TextDecoder)", {
  timeout: TSC_TIMEOUT_MS,
}, () => {
  // auth's `./server` custody graph uses `new TextEncoder()`; proving it compiles under the shim
  // shows the quarantined server entry is host-independent, not that it is host-*bound*.
  expect(typechecksUnderGate("tsconfig.server-ok.json").ok).toBe(true)
})

test("the portability gate rejects a neutral entry referencing a DOM-only global", {
  timeout: TSC_TIMEOUT_MS,
}, () => {
  const result = typechecksUnderGate("tsconfig.bad.json")
  expect(result.ok).toBe(false)
  // The failure names the offending DOM global, so the gate points at the real portability breach.
  expect(result.output).toContain("document")
})
