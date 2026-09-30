import { appTestConfig, testConfig } from "@plainworks/vitest-config"
import { memoryWorkspaceFiles } from "@plainworks/workspace"
import { describe, expect, it } from "vitest"
import { checkShape, syncShape } from "./shape"
import { memoryConfigLoader, shapedBuilds, shapedRepo, shapedTestConfigs } from "./testing/repo"

function repo(changes: Record<string, string | undefined> = {}) {
  const files: Record<string, string> = shapedRepo()
  for (const [path, text] of Object.entries(changes)) {
    if (text === undefined) delete files[path]
    else files[path] = text
  }
  return memoryWorkspaceFiles(files)
}

const messages = async (
  files: ReturnType<typeof repo>,
  builds: Record<string, unknown> = shapedBuilds(),
  tests: Record<string, unknown> = shapedTestConfigs(),
) =>
  (await checkShape(files, memoryConfigLoader(builds, tests))).map((i) => `${i.dir}: ${i.message}`)

function edit(path: string, change: (manifest: Record<string, unknown>) => void): string {
  const manifest = JSON.parse(shapedRepo()[path] ?? "{}")
  change(manifest)
  return JSON.stringify(manifest)
}

describe("checkShape", () => {
  it("passes a repository where every workspace is on its profile", async () => {
    expect(await messages(repo())).toEqual([])
  })

  it("flags every workspace a changed profile moves, so the gate fails closed", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts", list: "src/list/index.ts" } }
    builds["packages/ui"] = { entry: { index: "src/index.ts" } }
    expect(await messages(repo(), builds)).toEqual([
      'packages/std: package.json "exports" does not match the profile; run `bun run sync-shape`',
      'packages/ui: package.json "sideEffects" does not match the profile; run `bun run sync-shape`',
      'packages/ui: package.json "exports" does not match the profile; run `bun run sync-shape`',
      'packages/ui: package.json "files" does not match the profile; run `bun run sync-shape`',
      'packages/ui: package.json script "build" does not match the profile; run `bun run sync-shape`',
    ])
  })

  it("flags a hand-edited export and a script the profile drops", async () => {
    const files = repo({
      "packages/std/package.json": edit("packages/std/package.json", (m) => {
        m.exports = { ".": "./dist/index.js" }
        m.scripts = { ...(m.scripts as object), lint: "biome check ." }
      }),
    })
    expect(await messages(files)).toEqual([
      'packages/std: package.json "exports" does not match the profile; run `bun run sync-shape`',
      'packages/std: package.json script "lint" does not match the profile; run `bun run sync-shape`',
    ])
  })

  it("requires the shared presets as dependencies, except in the preset itself", async () => {
    const files = repo({
      "packages/create-plainworks/package.json": edit(
        "packages/create-plainworks/package.json",
        (m) => {
          m.devDependencies = { "@plainworks/vitest-config": "workspace:*" }
        },
      ),
      "internal/release/package.json": edit("internal/release/package.json", (m) => {
        m.name = "@plainworks/vitest-config"
        delete m.devDependencies
      }),
      "apps/web/package.json": edit("apps/web/package.json", (m) => {
        m.dependencies = { "@plainworks/vitest-config": "workspace:*" }
        m.devDependencies = {}
      }),
    })
    expect(await messages(files)).toEqual([
      'packages/create-plainworks: package.json devDependency "@plainworks/tsdown-config" is missing; run `bun run sync-shape`',
    ])
  })

  it("rejects tsconfig paths and condition overrides", async () => {
    const files = repo({
      "packages/std/tsconfig.json": JSON.stringify({ compilerOptions: { paths: { a: ["b"] } } }),
      "apps/web/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.app.json",
        compilerOptions: { customConditions: ["@plainworks/source"] },
      }),
    })
    expect(await messages(files)).toEqual([
      "apps/web: tsconfig.json overrides customConditions; the shared config owns how @plainworks/* resolves",
      "packages/std: tsconfig.json declares paths; @plainworks/* resolves through the source export condition",
    ])
  })

  it("allows only the `@/*` alias, and only for a package with vendored code", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts" }, vendored: "src/shadcn" }
    const alias = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } })
    expect(await messages(repo({ "packages/std/tsconfig.json": alias }), builds)).toEqual([])
    expect(await messages(repo({ "packages/std/tsconfig.json": alias }))).toEqual([
      "packages/std: tsconfig.json declares paths; @plainworks/* resolves through the source export condition",
    ])
  })

  it("keeps the solution tsconfig pointing at every project, in typecheck order", async () => {
    const files = repo({
      "packages/ui/tsconfig.json": JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.src.json" }],
      }),
    })
    expect(await messages(files)).toEqual([
      "packages/ui: tsconfig.json must reference ./tsconfig.src.json, ./tsconfig.client.json",
    ])
  })

  it("keeps the DOM lib out of a package's shipped projects unless the package declares `dom`", async () => {
    const dom = JSON.stringify({ compilerOptions: { lib: ["ES2023", "DOM"] } })
    const files = repo({
      "packages/std/tsconfig.json": dom,
      "packages/std/tsconfig.adapters.json": dom,
      "packages/std/tsconfig.test.json": dom,
      "packages/ui/tsconfig.client.json": dom,
    })
    const builds = shapedBuilds()
    expect((await messages(files, builds)).filter((m) => m.includes("DOM lib"))).toEqual([
      "packages/std: tsconfig.json adds the DOM lib; a package without `dom` keeps DOM to its adapter, test, and tooling projects",
    ])
    builds["packages/ui"] = { entry: { index: "src/index.ts" } }
    expect((await messages(files, builds)).filter((m) => m.includes("DOM lib"))).toContain(
      "packages/ui: tsconfig.client.json adds the DOM lib; a package without `dom` keeps DOM to its adapter, test, and tooling projects",
    )
  })

  it("compiles a `testing` entry in its own `tsconfig.testing.json` project", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts", testing: "src/testing.ts" } }
    expect((await messages(repo(), builds)).filter((m) => m.includes("testing"))).toContain(
      "packages/std: the `testing` entry needs its own tsconfig.testing.json project",
    )
    const withProject = repo({ "packages/std/tsconfig.testing.json": "{}" })
    expect(
      (await messages(withProject, builds)).filter((m) =>
        m.includes("tsconfig.testing.json project"),
      ),
    ).toEqual([])
  })

  it("rejects an entry named after a host instead of what it does", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = {
      entry: { index: "src/index.ts", browser: "src/playwright.ts", "web/node": "src/web/node.ts" },
    }
    expect((await messages(repo(), builds)).filter((m) => m.includes("host"))).toEqual([
      'packages/std: entry "browser" is named after a host; name an adapter after what it does (e.g. "web-storage")',
      'packages/std: entry "web/node" is named after a host; name an adapter after what it does (e.g. "web-storage")',
    ])
  })

  it("requires the shared Vitest preset for the workspace's kind", async () => {
    const files = repo({
      "packages/std/vitest.config.ts": 'import { defineConfig } from "vitest/config"',
      "apps/web/vitest.config.ts": undefined,
      "internal/release/vitest.config.ts":
        'import { appTestConfig } from "@plainworks/vitest-config"',
    })
    expect(await messages(files)).toEqual([
      "apps/web: vitest.config.ts is missing; use appTestConfig from @plainworks/vitest-config",
      "internal/release: vitest.config.ts must use testConfig from @plainworks/vitest-config",
      "packages/std: vitest.config.ts must use testConfig from @plainworks/vitest-config",
    ])
  })

  it("checks the config the preset import produces, not just the import", async () => {
    const withoutFloor = testConfig()
    const bypassed = { test: { coverage: { provider: "v8" } } }
    const lowered = {
      ...withoutFloor,
      test: {
        ...withoutFloor.test,
        coverage: { provider: "v8", thresholds: { lines: 80, functions: 50 } },
      },
    }
    const tests = {
      ...shapedTestConfigs(),
      "packages/std": bypassed,
      "packages/ui": lowered,
      "internal/release": () => testConfig(),
      "apps/web": { ...appTestConfig(), resolve: testConfig().resolve },
    }
    const use = "use testConfig from @plainworks/vitest-config"
    expect(await messages(repo(), shapedBuilds(), tests)).toEqual([
      "apps/web: vitest.config.ts resolves @plainworks/* from source; an app tests dist, use appTestConfig from @plainworks/vitest-config",
      `internal/release: vitest.config.ts must export a config object; ${use}`,
      `packages/std: vitest.config.ts does not resolve @plainworks/* from source; ${use}`,
      `packages/std: vitest.config.ts must hold v8 coverage at 80% or above on every metric; ${use}`,
      `packages/ui: vitest.config.ts must hold v8 coverage at 80% or above on every metric; ${use}`,
    ])
  })

  it("holds tools to src/ with colocated tests on the tool tsconfig", async () => {
    const files = repo({
      "internal/release/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json" }),
      "internal/release/scan.ts": "",
      "internal/release/.dependency-cruiser.cjs": "",
      "internal/release/test/scan.test.ts": "",
      "internal/release/src/cli.ts": "#!/usr/bin/env bun\n",
    })
    expect(await messages(files)).toEqual([
      "internal/release: tsconfig.json must extend ../../tsconfig.tool.json",
      "internal/release: scan.ts sits outside src/; a tool keeps its code in src/",
      "internal/release: test/ holds tests; colocate them with the code in src/",
      "internal/release: src/cli.ts must start with `#!/usr/bin/env -S bun --conditions=@plainworks/source` so it runs from source",
    ])
  })

  it("holds apps to the shared app tsconfig, tool bins, and dev-only testkit", async () => {
    const files = repo({
      "apps/web/tsconfig.json": JSON.stringify({ extends: "../../tsconfig.base.json" }),
      "apps/web/package.json": edit("apps/web/package.json", (m) => {
        m.scripts = { ...(m.scripts as object), scan: "bun ../../internal/scan/cli.ts" }
        m.dependencies = { "@plainworks/testkit": "workspace:*" }
      }),
    })
    expect(await messages(files)).toEqual([
      "apps/web: tsconfig.json must extend ../../tsconfig.app.json",
      'apps/web: script "scan" calls ../../internal directly; call the tool\'s bin instead',
      "apps/web: @plainworks/testkit is a runtime dependency; keep it in devDependencies",
    ])
  })

  it("fails on a package without a build, or with a malformed one", async () => {
    const builds = shapedBuilds()
    delete builds["packages/std"]
    await expect(checkShape(repo(), memoryConfigLoader(builds))).rejects.toThrow(
      /packages\/std has no tsdown.config.ts build/,
    )
    const malformed = { ...builds, "packages/std": { entries: {} } }
    await expect(checkShape(repo(), memoryConfigLoader(malformed))).rejects.toThrow(
      /packages\/std: tsdown.config.ts exports no valid `build`/,
    )
  })
})

describe("syncShape", () => {
  it("writes the derived fields so the repository passes the check", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts", list: "src/list/index.ts" } }
    const files = repo({
      "packages/std/package.json": edit("packages/std/package.json", (m) => {
        delete m.files
        m.scripts = { ...(m.scripts as object), lint: "biome check ." }
        m.devDependencies = { typescript: "catalog:" }
      }),
    })
    const changed = await syncShape(files, memoryConfigLoader(builds))
    expect(changed).toEqual(["packages/std"])
    expect(await messages(files, builds)).toEqual([])
    const std = JSON.parse(files.readText("packages/std/package.json") ?? "")
    expect(Object.keys(std)).toEqual([
      "name",
      "type",
      "sideEffects",
      "exports",
      "files",
      "scripts",
      "devDependencies",
    ])
    expect(std.exports["./list"]["@plainworks/source"]).toBe("./src/list/index.ts")
    expect(std.scripts.lint).toBeUndefined()
    expect(Object.keys(std.devDependencies)).toEqual([
      "@plainworks/tsdown-config",
      "@plainworks/vitest-config",
      "typescript",
    ])
  })

  it("syncs only the named workspaces and leaves a shaped workspace untouched", async () => {
    const files = repo({
      "packages/std/package.json": edit("packages/std/package.json", (m) => {
        delete m.files
      }),
    })
    expect(await syncShape(files, memoryConfigLoader(shapedBuilds()), ["packages/ui"])).toEqual([])
    expect(await syncShape(files, memoryConfigLoader(shapedBuilds()), ["packages/std"])).toEqual([
      "packages/std",
    ])
  })

  it("rejects a directory that is not a workspace", async () => {
    await expect(
      syncShape(repo(), memoryConfigLoader(shapedBuilds()), ["packages/nope"]),
    ).rejects.toThrow(/packages\/nope is not a workspace/)
  })
})
