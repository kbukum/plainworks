// Layer-boundary + cycle gate for plainworks.
//
// This lives in `@plainworks/boundaries` so the whole TS-AST toolchain (dependency-cruiser
// and its `typescript`) is isolated to one package. dependency-cruiser parses with the
// TypeScript Compiler API, which TypeScript 7 (native `tsgo`) does not yet expose. Adopting
// TS7 later is therefore a one-file flip: alias `typescript` -> `@typescript/typescript6` in
// THIS package's package.json only, with zero churn to the rest of the repo. See
// docs/architecture.md › Governance.
//
// Single source of truth for the layer map (mirrors README + docs/architecture.md):
//
//   L0  std
//   L1  state · ui · http
//   L2  channel · connect · query
//   L3  auth
//   L4  app · testkit · mocks        (dev/test tooling lives here too)
//
// Rule: a package in Ln may import @plainworks packages only in a strictly LOWER layer.
// Same-layer ("sideways") and upward imports are forbidden. A cross-layer need defines the
// seam in the lower layer and implements it higher (the gokit/rskit rule).
//
// Package sources resolve to `packages/<name>/src` via the tsconfig `paths` alias, so the
// graph is analysed source->source and does not require a build first.

const path = require("node:path")

// A test module: `*.test.ts`/`*.test.tsx`. Test files are the ONLY source permitted the single
// upward exception below (importing @plainworks/testkit); production source is not.
const TEST_FILE = "\\.test\\.tsx?$"

// Repo root, resolved from this file so cwd (a package dir under `bun run --filter`) is irrelevant.
const repoRoot = path.resolve(__dirname, "..", "..")

const LAYERS = {
  std: 0,
  state: 1,
  ui: 1,
  http: 1,
  channel: 2,
  connect: 2,
  query: 2,
  auth: 3,
  app: 4,
  testkit: 4,
  mocks: 4,
}

/** @returns {import('dependency-cruiser').IForbiddenRuleType[]} */
function layerRules() {
  return Object.entries(LAYERS).map(([pkg, layer]) => {
    // Packages this one must NOT import: anything at the same or a higher layer, except itself.
    // `testkit` is carved out here and governed by `no-production-testkit-import` instead, so the
    // one test-only exception lives in a single place; every other upward/sideways edge (including
    // testkit imported from *production* source) still trips this rule.
    const forbidden = Object.entries(LAYERS)
      .filter(([other, otherLayer]) => other !== pkg && otherLayer >= layer && other !== "testkit")
      .map(([other]) => other)

    return {
      name: `no-upward-${pkg}`,
      comment: `packages/${pkg} (L${layer}) may import only @plainworks packages in a strictly lower layer.`,
      severity: "error",
      from: { path: `(^|/)packages/${pkg}/src/` },
      to: {
        path: `(^|/)packages/(${forbidden.length ? forbidden.join("|") : "\\0never\\0"})/`,
      },
    }
  })
}

/** @type {import('dependency-cruiser').IForbiddenRuleType[]} */
const forbidden = [
  {
    name: "no-circular",
    comment: "No import cycles anywhere in the graph.",
    severity: "error",
    from: {},
    to: { circular: true },
  },
  {
    name: "std-is-zero-dep",
    comment: "std is the bottom of the graph: it must not import any other @plainworks package.",
    severity: "error",
    from: { path: "(^|/)packages/std/src/" },
    to: { path: "(^|/)packages/(?!std/)[^/]+/" },
  },
  {
    // Fail CLOSED: layer rules above only exist for packages listed in LAYERS. A package that is
    // NOT in the map has no assigned layer, so without this rule it could import any package
    // unchecked (the "vacuously green" hole). Here an unmapped package may import no other
    // @plainworks package at all until it is added to LAYERS. `$2` (its own dir) is excluded so
    // intra-package relative imports stay legal. A freshly generated package imports nothing
    // internal, so it is still born gate-passing.
    name: "unmapped-package-no-internal-imports",
    comment:
      "This package is not in the LAYERS map, so it has no layer. Add it to LAYERS (in .dependency-cruiser.cjs) to give it a layer before importing another @plainworks package.",
    severity: "error",
    from: { path: `(^|/)packages/(?!(?:${Object.keys(LAYERS).join("|")})/)([^/]+)/src/` },
    to: { path: "(^|/)packages/", pathNot: "(^|/)packages/$2/" },
  },
  {
    // The incoming edge of fail-closed: the rule above stops an unmapped package importing OUT,
    // this stops a mapped package importing IN to a package with no layer. Without it a mapped
    // package could depend on an unmapped one unchecked — the same hole, other direction. Self
    // imports need no exclusion: a package cannot be both mapped and unmapped.
    name: "no-mapped-to-unmapped",
    comment:
      "The imported package is not in the LAYERS map, so no mapped package may depend on it. Add it to LAYERS (in .dependency-cruiser.cjs) first.",
    severity: "error",
    from: { path: `(^|/)packages/(?:${Object.keys(LAYERS).join("|")})/src/` },
    to: { path: `(^|/)packages/(?!(?:${Object.keys(LAYERS).join("|")})/)[^/]+/` },
  },
  {
    name: "no-package-into-apps-or-internal",
    comment:
      "Published packages must not import app code or internal dev tooling — those sit above the package graph, not below it.",
    severity: "error",
    from: { path: "(^|/)packages/[^/]+/src/" },
    to: { path: "(^|/)(apps|internal)/[^/]+/" },
  },
  {
    // The single, deliberate upward exception. @plainworks/testkit (L4) ships shared fakes and
    // harnesses that lower packages consume in their tests — a test-only edge, so `*.test.ts(x)`
    // source is exempt (via `from.pathNot`) while production source may not pull test tooling into
    // the shipped graph. This replaces testkit's coverage in the per-layer rules above, keeping the
    // exception narrow: it relaxes testkit and only testkit, and only for test files. `testkit`'s
    // own source is excluded from `from` so its internal imports stay legal.
    name: "no-production-testkit-import",
    comment:
      "Only *.test.ts(x) files may import @plainworks/testkit; production source must not pull test tooling into the shipped graph.",
    severity: "error",
    from: { path: "(^|/)packages/(?!testkit/)[^/]+/src/", pathNot: TEST_FILE },
    to: { path: "(^|/)packages/testkit/" },
  },
  ...layerRules(),
]

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: "node_modules" },
    // Keep the gate off this package's own layer-violation test fixtures.
    exclude: { path: "(^|/)internal/boundaries/test/" },
    includeOnly: "(^|/)(packages|apps|internal)/[^/]+/src/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: path.join(repoRoot, "tsconfig.base.json") },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
}

// The `forbidden` array above is reused by this package's fixture-backed test so the test
// asserts against the exact rules the gate ships (no drift). It is a valid config key, so no
// extra top-level exports are attached here (dependency-cruiser rejects unknown config keys).
