// Layer-boundary + cycle gate for plainworks.
//
// This lives in `@plainworks/boundaries` so the whole TS-AST toolchain (dependency-cruiser
// and its `typescript`) is isolated to one package. dependency-cruiser parses with the
// TypeScript Compiler API, which TypeScript 7 (native `tsgo`) does not yet expose. Adopting
// TS7 later is therefore a one-file flip: alias `typescript` -> `@typescript/typescript6` in
// THIS package's package.json only, with zero churn to the rest of the repo. See
// docs/architecture.md › Governance.
//
// The layer map lives in `layers.json` beside this file: one entry per layer, L0 first. It is the
// single source; `bun run sync-layer-map` renders the README, `docs/architecture.md`, and the
// instructions from it, and `bun run check-layer-map` fails when they drift.
//
// The heavy leaf UI domains `charts`/`media`/`editors` are reserved for L4 on `ui`+`elements`+
// `theme` (see docs/architecture.md › UI family); they are added to `layers.json` only when built,
// and their arrival pushes `app`/`testkit`/`mocks` to L5. Until then `ui` at L3 with `app` at L4
// is the valid intermediate state.
//
// Rule: a package in Ln may import @plainworks packages only in a strictly LOWER layer.
// Same-layer ("sideways") and upward imports are forbidden. A cross-layer need defines the
// seam in the lower layer and implements it higher (the gokit/rskit rule).
//
// Package imports resolve to `packages/<name>/src` through the `@plainworks/source` export
// condition, and vendored atom subpaths through the aliases in `.dependency-cruiser.resolve.cjs`,
// so the graph is analysed source->source and does not require a build first.

const path = require("node:path")

// A test module: `*.test.ts`/`*.test.tsx`. Test files are the ONLY source permitted the single
// upward exception below (importing test tooling); production source is not.
const TEST_FILE = "\\.test\\.tsx?$"

// A module in a package's `./testing` profile: the `src/testing.ts` entry or anything under
// `src/testing/`.
const TESTING_MODULE = "(^|/)packages/[^/]+/src/testing(\\.ts$|/)"

// Repo root, resolved from this file so cwd (a package dir under `bun run --filter`) is irrelevant.
const repoRoot = path.resolve(__dirname, "..", "..")

// Package name -> layer number, derived from the layer order in `layers.json`.
const LAYERS = Object.fromEntries(
  require("./layers.json").layers.flatMap((entry, layer) =>
    entry.packages.map((pkg) => [pkg, layer]),
  ),
)

// Internal concern order INSIDE @plainworks/ui — the package LAYERS model, one level down. `ui`
// (L3) keeps the interwoven `forms`/`data` concerns as subpaths (not separate packages), so their
// direction is governed here instead of by the package layers. The bands are:
//
//   0  foundation   state · region · actions · clipboard · keyboard · media
//   1  general      layout · feedback · overlays · display · navigation · command
//   2  composites   forms · shell
//   3  assemblies   data · theme
//
// A concern folder may import only a STRICTLY LOWER band; a same-band sibling import (baseline
// rule A: "a concern folder never imports a sibling concern") and an upward import are both
// forbidden, so a piece shared across concerns sinks to a lower band instead of creating a
// back-edge. `dir` is relative to `packages/ui/src/`. The neutral `index.ts` entry sits OUTSIDE
// every concern folder; components are published one per subpath, so there is no aggregate barrel.
// A concern folder absent from this table has no band; `unmappedUiConcernRules` below fails it
// closed (it may import no other ui concern) so an unlisted folder never goes vacuously green.
const UI_CONCERNS = {
  state: { band: 0, dir: "state" },
  region: { band: 0, dir: "region" },
  actions: { band: 0, dir: "client/actions" },
  clipboard: { band: 0, dir: "client/clipboard" },
  keyboard: { band: 0, dir: "client/keyboard" },
  media: { band: 0, dir: "client/media" },
  layout: { band: 1, dir: "client/layout" },
  feedback: { band: 1, dir: "client/feedback" },
  overlays: { band: 1, dir: "client/overlays" },
  display: { band: 1, dir: "client/display" },
  navigation: { band: 1, dir: "client/navigation" },
  command: { band: 1, dir: "client/command" },
  forms: { band: 2, dir: "client/forms" },
  shell: { band: 2, dir: "client/shell" },
  data: { band: 3, dir: "client/data" },
  // Theme controls compose forms (the motion radio group) and display (the preview chart).
  theme: { band: 3, dir: "client/theme" },
}

// Directory segments of every classified concern, split by location so the fail-closed catch-all
// below can name exactly the mapped folders. Neutral concerns sit directly under `src/` (e.g.
// `state`); client concerns sit under `src/client/` (e.g. `layout`, `forms`).
const neutralConcernDirs = Object.values(UI_CONCERNS)
  .map(({ dir }) => dir)
  .filter((dir) => !dir.includes("/"))
const clientConcernDirs = Object.values(UI_CONCERNS)
  .map(({ dir }) => dir)
  .filter((dir) => dir.startsWith("client/"))
  .map((dir) => dir.slice("client/".length))

/** @returns {import('dependency-cruiser').IForbiddenRuleType[]} */
function unmappedUiConcernRules() {
  // Fail CLOSED for the concern bands, exactly as `unmapped-package-no-internal-imports` does for
  // the package layers. A concern folder that is NOT in UI_CONCERNS has no band, so none of the
  // generated `no-ui-upward-*` rules name it as a source — leaving it free to import a sibling, a
  // higher band, or a re-exporting module unchecked (the "vacuously green" hole one level down).
  // These two rules close it: an unclassified concern folder (neutral `src/<x>/` or client
  // `src/client/<x>/`) may import NOTHING else under `packages/ui/src` until it is added to
  // UI_CONCERNS with a band. `$2` (its own folder) stays legal so intra-concern relative imports
  // work, and a freshly generated concern imports nothing cross-concern, so it is still born
  // gate-passing. `client` and the mapped folders are excluded from each `from` so only genuinely
  // unmapped folders match.
  return [
    {
      name: "unmapped-ui-concern-neutral",
      comment:
        "The packages/ui/src/<concern> folder is not in UI_CONCERNS, so it has no band. Add it to UI_CONCERNS (in .dependency-cruiser.cjs) with a band before importing another @plainworks/ui concern.",
      severity: "error",
      from: {
        path: `(^|/)packages/ui/src/(?!(?:client|${neutralConcernDirs.join("|")})/)([^/]+)/`,
      },
      to: { path: "(^|/)packages/ui/src/", pathNot: "(^|/)packages/ui/src/$2/" },
    },
    {
      name: "unmapped-ui-concern-client",
      comment:
        "The packages/ui/src/client/<concern> folder is not in UI_CONCERNS, so it has no band. Add it to UI_CONCERNS (in .dependency-cruiser.cjs) with a band before importing another @plainworks/ui concern.",
      severity: "error",
      from: { path: `(^|/)packages/ui/src/client/(?!(?:${clientConcernDirs.join("|")})/)([^/]+)/` },
      to: { path: "(^|/)packages/ui/src/", pathNot: "(^|/)packages/ui/src/client/$2/" },
    },
  ]
}

/** @returns {import('dependency-cruiser').IForbiddenRuleType[]} */
function uiConcernRules() {
  return Object.entries(UI_CONCERNS).map(([name, { band, dir }]) => {
    // Fail CLOSED: forbid importing ANYTHING under packages/ui/src except this concern's own folder
    // and the concern folders in a strictly LOWER band. Listing only the higher/sibling concerns
    // would leave a hole — a foundation concern could reach a higher one transitively through the
    // top-level `index.ts` (or any uncategorized `src/` module that re-exports it). So a same-band
    // sibling, an upward concern, a re-exporting module, and a junk-drawer bridge are all rejected;
    // a piece shared across concerns must sink to a lower band, not hide behind a re-export.
    const allowed = [
      `(^|/)packages/ui/src/${dir}/`,
      ...Object.values(UI_CONCERNS)
        .filter((other) => other.band < band)
        .map((other) => `(^|/)packages/ui/src/${other.dir}/`),
    ]

    return {
      name: `no-ui-upward-${name}`,
      comment: `packages/ui/src/${dir} (concern band ${band}) may import only its own folder and a strictly lower @plainworks/ui concern band — no sibling, upward, or via-barrel concern import (baseline rule A).`,
      severity: "error",
      from: { path: `(^|/)packages/ui/src/${dir}/` },
      to: { path: "(^|/)packages/ui/src/", pathNot: allowed },
    }
  })
}

/** @returns {import('dependency-cruiser').IForbiddenRuleType[]} */
function layerRules() {
  return Object.entries(LAYERS).map(([pkg, layer]) => {
    // Packages this one must NOT import: anything at the same or a higher layer, except itself.
    // Test tooling is carved out here and governed by `no-production-test-tooling-import` instead,
    // so the test-only exception lives in one place. Every production import still trips that rule.
    const forbidden = Object.entries(LAYERS)
      .filter(
        ([other, otherLayer]) =>
          other !== pkg && otherLayer >= layer && other !== "testkit" && other !== "mocks",
      )
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
      "This package is not in the LAYERS map, so it has no layer. Add it to internal/boundaries/layers.json to give it a layer before importing another @plainworks package.",
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
      "The imported package is not in the LAYERS map, so no mapped package may depend on it. Add it to internal/boundaries/layers.json first.",
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
    // The deliberate upward exception. Tests in lower packages consume shared fakes from testkit
    // and mocked services from mocks. Production modules may not pull either L4 package into their
    // shipped graph. The tooling packages' own sources are excluded so their internal imports stay
    // legal.
    name: "no-production-test-tooling-import",
    comment:
      "Only *.test.ts(x) files may import @plainworks/testkit or @plainworks/mocks; production source must not pull test tooling into the shipped graph.",
    severity: "error",
    from: { path: "(^|/)packages/(?!(?:testkit|mocks)/)[^/]+/src/", pathNot: TEST_FILE },
    to: { path: "(^|/)packages/(?:testkit|mocks)/" },
  },
  {
    name: "no-app-production-testkit-import",
    comment:
      "Only app test files, e2e modules, and Playwright configuration may import @plainworks/testkit.",
    severity: "error",
    from: {
      path: "(^|/)apps/[^/]+/",
      pathNot: [TEST_FILE, "(^|/)apps/[^/]+/e2e/", "(^|/)apps/[^/]+/playwright\\.config\\.ts$"],
    },
    to: { path: "(^|/)packages/testkit/" },
  },
  {
    // The `./testing` profile. A package's test-only helpers (`src/testing.ts` + `src/testing/`) may
    // use Node or the DOM, so only tests — and the helpers themselves — may import them. Any other
    // module doing so would pull test tooling into a shipped `.`, `./client`, or adapter graph.
    name: "no-production-testing-import",
    comment:
      "Only *.test.ts(x) files and the ./testing helpers themselves may import a package's src/testing; production source must not ship test tooling.",
    severity: "error",
    from: { path: "(^|/)packages/[^/]+/src/", pathNot: [TEST_FILE, TESTING_MODULE] },
    to: { path: TESTING_MODULE },
  },
  {
    // Token-custody quarantine. The server-only auth graph (`server.ts` + `server/**`) holds the
    // session-signing secret, so it must never be pulled into a `"use client"` bundle. dependency-
    // cruiser is path-based and cannot read a `"use client"` directive, so the boundary is drawn
    // structurally: a client entry graph — `src/client.ts` or `src/client/**`, where every
    // `"use client"` module lives — may not import auth's server graph. The package export map
    // (`.` vs `./server` vs `./client`) draws the same line for external consumers; together they
    // keep the signing secret out of any browser bundle. See docs/architecture.md › Server/client split.
    name: "no-client-into-auth-server",
    comment:
      'A client graph (src/client.ts or src/client/**) must not import @plainworks/auth server-only custody (packages/auth/src/server) — server secrets never enter a "use client" bundle.',
    severity: "error",
    from: { path: "(^|/)packages/[^/]+/src/client(\\.tsx?$|/)" },
    to: { path: "(^|/)packages/auth/src/server(\\.tsx?$|/)" },
  },
  {
    // Custody ownership — the incoming half of the quarantine. The rule above only forbids the
    // *client* graph reaching custody directly; this one forbids the neutral `.` graph (and auth's
    // own client graph) from importing `server/**` at all, so the ONLY door into the signing secret
    // is auth's `server.ts` entry (the `./server` export). That closes the transitive hole
    // dependency-cruiser's direct-edge rules would otherwise leave — a client importing the neutral
    // `.` barrel can never reach custody, because the barrel can never reach it either. auth's own
    // server graph (`server.ts` + `server/**`) is exempt so the barrel can re-export its modules.
    name: "no-nonserver-into-auth-server",
    comment:
      "Only @plainworks/auth's server graph and test-only helpers may import server custody; no-production-testing-import keeps those helpers out of neutral and client production graphs.",
    severity: "error",
    from: {
      path: "(^|/)packages/auth/src/",
      pathNot: ["(^|/)packages/auth/src/server(\\.tsx?$|/)", TEST_FILE, TESTING_MODULE],
    },
    to: { path: "(^|/)packages/auth/src/server(\\.tsx?$|/)" },
  },
  {
    // OIDC token-custody and OAuth stack quarantine. The OIDC adapter modules (`adapter/oidc/**`)
    // hold the OAuth2 client stack (`oauth4webapi` / `jose`) and in-memory access/refresh tokens.
    // They must never be pulled into a `"use client"` bundle. The type/constant-only `config.ts`
    // is exempt so neutral and client code can declare or configure the adapter kind.
    name: "no-client-into-auth-oidc",
    comment:
      'A client graph (src/client.ts or src/client/**) must not import @plainworks/auth OIDC adapter custody (packages/auth/src/adapter/oidc) — OAuth stack and token custody never enter a "use client" bundle (config.ts is exempt).',
    severity: "error",
    from: {
      path: "(^|/)packages/[^/]+/src/client(\\.tsx?$|/)",
      pathNot: [
        "(^|/)packages/auth/src/server(\\.tsx?$|/)",
        "(^|/)packages/auth/src/adapter/oidc/",
        TEST_FILE,
      ],
    },
    to: {
      path: "(^|/)packages/auth/src/adapter/oidc/",
      pathNot: "(^|/)packages/auth/src/adapter/oidc/config(\\.tsx?$)",
    },
  },
  {
    // OIDC custody ownership — the transitive half of the quarantine. A neutral (non-server) auth
    // module reaching into `adapter/oidc/**` must trip this rule, proving the OAuth stack and tokens
    // are reachable only through auth's own server entry — so a client or neutral importer of the
    // `.` barrel can never reach custody (config.ts is exempt).
    name: "no-nonserver-into-auth-oidc",
    comment:
      "Only @plainworks/auth's server graph, OIDC adapter and test-only helpers may import OIDC custody; no-production-testing-import keeps those helpers out of neutral and client production graphs (config.ts is exempt).",
    severity: "error",
    from: {
      path: "(^|/)packages/auth/src/",
      pathNot: [
        "(^|/)packages/auth/src/server(\\.tsx?$|/)",
        "(^|/)packages/auth/src/adapter/oidc/",
        TEST_FILE,
        TESTING_MODULE,
      ],
    },
    to: {
      path: "(^|/)packages/auth/src/adapter/oidc/",
      pathNot: "(^|/)packages/auth/src/adapter/oidc/config(\\.tsx?$)",
    },
  },
  {
    // app-F2'/app-F3: the @plainworks/app composition kernel is `ui`-free by charter. `ui` is L3 and
    // `app` is L4, so the layer rules would *allow* app→ui (a downward import); this rule forbids it
    // anyway. The neutral `.` core and the headless `./client` binding compose whatever capabilities
    // are injected and never import @plainworks/ui — the `ui`-backed batteries (theme capability,
    // error-boundary fallback) live in the showcase/starter, keeping app host-neutral and buildable
    // before `ui` exists. See packages/app/README.md and the L4 row in docs/architecture.md.
    name: "no-app-into-ui",
    comment:
      "@plainworks/app must not import @plainworks/ui: the composition kernel is ui-free (app-F3). ui-backed batteries live in the showcase/starter, not in app core.",
    severity: "error",
    from: { path: "(^|/)packages/app/src/" },
    to: { path: "(^|/)packages/ui/" },
  },
  ...layerRules(),
  ...uiConcernRules(),
  ...unmappedUiConcernRules(),
]

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: "node_modules" },
    // Keep the gate off this package's own layer-violation test fixtures.
    exclude: { path: "(^|/)internal/boundaries/fixtures/" },
    includeOnly: "(^|/)(packages|apps|internal)/[^/]+/src/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: path.join(repoRoot, "tsconfig.base.json") },
    webpackConfig: { fileName: path.join(__dirname, ".dependency-cruiser.resolve.cjs") },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      // `@plainworks/source` first, as in `tsconfig.base.json`: workspace imports resolve to
      // source, so the gate checks the real import graph without a build.
      conditionNames: ["@plainworks/source", "import", "types", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
}

// The `forbidden` array above is reused by this package's fixture-backed test so the test
// asserts against the exact rules the gate ships (no drift). It is a valid config key, so no
// extra top-level exports are attached here (dependency-cruiser rejects unknown config keys).
