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
 * Proves the gate actually bites, in both directions. The fixtures contain the ways to break the
 * layer model — an upward import (`std` L0 -> `auth` L3), an upward import among the UI family
 * (`theme` L1 -> `elements` L2), a same-layer import (`state` L1 -> `theme` L1), an unmapped
 * package reaching into another package, a mapped package reaching into an unmapped one (`state` ->
 * `rogue`), and a package reaching up into app code — plus the legal cases (higher -> lower,
 * intra-package) that must stay green. Without this, a repo with zero feature packages would leave
 * the gate vacuously green, and a reversed layer comparison or over-broad regex could pass
 * unnoticed.
 */
test("layer violations trip the gate", async () => {
  const violations = await cruiseFixtures()
  const tripped = new Set(violations.map((v) => v.rule.name))

  // std (L0) illegally importing auth (L3).
  expect(tripped.has("no-upward-std")).toBe(true)
  expect(tripped.has("std-is-zero-dep")).toBe(true)
  // theme (L1) illegally importing elements (L2) — an upward import within the new UI family.
  expect(tripped.has("no-upward-theme")).toBe(true)
  // state (L1) illegally importing theme (also L1) — sideways is as forbidden as upward.
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

/**
 * OIDC token-custody quarantine. The OIDC adapter graph (`adapter/oidc/**`) carries the OAuth stack
 * (`oauth4webapi`/`jose`) and the in-memory access/refresh tokens, so a `"use client"` graph must
 * never import it. The fixture is a client-graph module (`auth/src/client/oidc-leak.ts`) importing
 * the adapter (`auth/src/adapter/oidc/adapter.ts`) — the edge that must trip the rule.
 */
test("a client graph importing auth OIDC adapter custody trips the quarantine rule", async () => {
  const violations = await cruiseFixtures()
  const tripped = violations.find(
    (v) =>
      v.rule.name === "no-client-into-auth-oidc" &&
      v.from.endsWith("auth/src/client/oidc-leak.ts") &&
      v.to.endsWith("auth/src/adapter/oidc/adapter.ts"),
  )
  expect(tripped).toBeDefined()
})

/**
 * OIDC custody ownership — the transitive half. A neutral (non-server) auth module reaching into
 * `adapter/oidc/**` must trip `no-nonserver-into-auth-oidc`, proving the OAuth stack and tokens are
 * reachable only through auth's own server entry. The type/constant-only `config.ts` is exempt, so
 * the neutral `.` barrel re-exporting `OIDC_ADAPTER_KIND` stays legal (asserted below).
 */
test("a neutral auth module importing OIDC adapter custody trips the ownership rule", async () => {
  const violations = await cruiseFixtures()
  const tripped = violations.find(
    (v) =>
      v.rule.name === "no-nonserver-into-auth-oidc" &&
      v.from.endsWith("auth/src/neutral-oidc-leak.ts") &&
      v.to.endsWith("auth/src/adapter/oidc/adapter.ts"),
  )
  expect(tripped).toBeDefined()
})

test("the neutral auth barrel importing OIDC config.ts is allowed", async () => {
  const violations = await cruiseFixtures()
  const tripped = violations.find(
    (v) =>
      (v.rule.name === "no-client-into-auth-oidc" ||
        v.rule.name === "no-nonserver-into-auth-oidc") &&
      v.to.endsWith("auth/src/adapter/oidc/config.ts"),
  )
  expect(tripped).toBeUndefined()
})

test("legal higher-to-lower imports are allowed", async () => {
  const violations = await cruiseFixtures()
  // `auth` (L3) -> `std` (L0) is the layer model working as intended; no rule may flag it.
  const downward = violations.find((v) => v.from.endsWith("auth/src/index.ts"))
  expect(downward).toBeUndefined()
})

/**
 * The @plainworks/app composition kernel is `ui`-free (app-F3). `ui` (L3) sits *below* `app` (L4),
 * so the layer model permits app -> ui as a legal downward import — this charter rule forbids it
 * anyway, keeping the kernel host-neutral and buildable before `ui` exists. The fixture is an app
 * module importing the `ui` stand-in; only `no-app-into-ui` may flag it.
 */
test("the app kernel importing ui trips the ui-free rule", async () => {
  const violations = await cruiseFixtures()
  const appToUi = violations.filter((v) => v.from.endsWith("app/src/ui-leak.ts"))
  expect(appToUi.map((v) => v.rule.name)).toEqual(["no-app-into-ui"])
})

/**
 * `@plainworks/ui` (L3) keeps the interwoven `forms`/`data` concerns as internal subpaths rather
 * than separate packages, so their direction is enforced one band below the package layers: a
 * concern folder may import only a strictly lower band (`foundation → general → forms → data`), and
 * a sibling or upward concern import is rejected just like an upward package import. The rule is
 * fail-closed: it also blocks laundering an upward import through the aggregate `client.ts` barrel.
 * All three are proven from fixtures — `forms` (band 2) reaching UP into `data` (band 3) trips
 * `no-ui-upward-forms` and only it, the general sibling edge `layout → feedback` (both band 1)
 * trips `no-ui-upward-layout`, and a foundation `client-hooks` (band 0) reaching `data` THROUGH the
 * barrel trips `no-ui-upward-client-hooks` — proving neither a sideways, an upward, nor a
 * via-barrel edge slips through. The legal counterpart is proven too: `data` (band 3) importing the
 * lower `forms` (band 2) is the sanctioned downward direction and trips nothing.
 */
test("ui concern imports respect the internal foundation → general → forms → data order", async () => {
  const violations = await cruiseFixtures()

  const formsIntoData = violations.filter((v) =>
    v.from.endsWith("ui/src/client/forms/uses-data.ts"),
  )
  expect(formsIntoData.map((v) => v.rule.name)).toEqual(["no-ui-upward-forms"])

  const layoutIntoFeedback = violations.filter((v) =>
    v.from.endsWith("ui/src/client/layout/uses-feedback.ts"),
  )
  expect(layoutIntoFeedback.map((v) => v.rule.name)).toEqual(["no-ui-upward-layout"])

  const hooksViaBarrel = violations.filter((v) =>
    v.from.endsWith("ui/src/client/hooks/uses-barrel.ts"),
  )
  expect(hooksViaBarrel.map((v) => v.rule.name)).toEqual(["no-ui-upward-client-hooks"])

  // The legal counterpart: `data` (band 3) importing the strictly-lower `forms` (band 2) is the
  // sanctioned downward direction; no rule may flag it, mirroring the `auth -> std` package check.
  const dataIntoForms = violations.filter((v) =>
    v.from.endsWith("ui/src/client/data-table/uses-forms.ts"),
  )
  expect(dataIntoForms).toEqual([])
})

/**
 * Fail-closed for the concern bands, one level below the package fail-closed. A concern folder that
 * is NOT in UI_CONCERNS has no band, so none of the `no-ui-upward-*` rules name it as a source — it
 * would be free to import a sibling, a higher band, or the aggregate barrel. The catch-all rules
 * close that hole in both concern locations. The fixtures prove it: an unmapped client concern
 * (`client/experimental`) and an unmapped neutral concern (`stately`) each reaching a mapped
 * concern trip only their dedicated rule, so an unlisted folder can never go vacuously green. The
 * same-folder exemption stays legal: an unmapped concern importing within its OWN folder trips
 * nothing, so a freshly generated concern still compiles its internal relative imports.
 */
test("an unmapped ui concern folder may import no other concern (fail-closed)", async () => {
  const violations = await cruiseFixtures()

  const clientConcern = violations.filter((v) =>
    v.from.endsWith("ui/src/client/experimental/uses-feedback.ts"),
  )
  expect(clientConcern.map((v) => v.rule.name)).toEqual(["unmapped-ui-concern-client"])

  const neutralConcern = violations.filter((v) =>
    v.from.endsWith("ui/src/stately/uses-feedback.ts"),
  )
  expect(neutralConcern.map((v) => v.rule.name)).toEqual(["unmapped-ui-concern-neutral"])

  // The same-folder exemption (`$2`) must stay legal: an unmapped concern importing WITHIN its own
  // folder is a normal intra-concern relative import, so neither catch-all may flag it — otherwise
  // a freshly generated concern could not compile its own internal modules.
  const clientSelf = violations.filter((v) =>
    v.from.endsWith("ui/src/client/experimental/local-consumer.ts"),
  )
  expect(clientSelf).toEqual([])

  const neutralSelf = violations.filter((v) => v.from.endsWith("ui/src/stately/local-consumer.ts"))
  expect(neutralSelf).toEqual([])
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
