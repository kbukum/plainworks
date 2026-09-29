import type { CliBuild, PackageBuild } from "@plainworks/tsdown-config"
import { appTestConfig, testConfig } from "@plainworks/vitest-config"
import type { ConfigLoader } from "../inspect"

const SOLUTION = (projects: readonly string[]): string =>
  JSON.stringify({ files: [], references: projects.map((p) => ({ path: `./${p}` })) })

/** A small repository already on its profiles: one package, one CLI, one tool, and one app. */
export function shapedRepo(): Record<string, string> {
  return {
    "package.json": JSON.stringify({ workspaces: ["packages/*", "internal/*", "apps/*"] }),
    "packages/std/package.json": json({
      name: "@plainworks/std",
      type: "module",
      sideEffects: false,
      exports: {
        ".": {
          "@plainworks/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
      },
      files: ["dist", "src", "!src/**/*.test.*"],
      scripts: {
        build: "tsdown",
        typecheck: "tsc --noEmit",
        test: "vitest run --coverage",
        "check-packaging": "plainworks-release check-packaging",
      },
      devDependencies: PACKAGE_PRESETS,
    }),
    "packages/std/tsconfig.json": '{\n  // comment\n  "extends": "../../tsconfig.base.json"\n}',
    "packages/std/tsdown.config.ts": "",
    "packages/std/vitest.config.ts": TEST_CONFIG,
    "packages/std/src/index.ts": "",
    "packages/ui/package.json": json({
      name: "@plainworks/ui",
      type: "module",
      sideEffects: ["**/*.css"],
      exports: {
        ".": {
          "@plainworks/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
        "./styles.css": "./dist/styles.css",
      },
      files: ["dist", "src", "!src/**/*.test.*", "registry.json"],
      scripts: {
        build: "tsdown && bun scripts/styles.ts",
        typecheck: "tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.client.json",
        test: "vitest run --coverage",
        "check-packaging": "plainworks-release check-packaging",
      },
      devDependencies: PACKAGE_PRESETS,
    }),
    "packages/ui/tsconfig.json": SOLUTION(["tsconfig.src.json", "tsconfig.client.json"]),
    "packages/ui/tsconfig.src.json": "{}",
    "packages/ui/tsconfig.client.json": "{}",
    "packages/ui/tsdown.config.ts": "",
    "packages/ui/vitest.config.ts": TEST_CONFIG,
    "packages/create-plainworks/package.json": json({
      name: "create-plainworks",
      type: "module",
      bin: { "create-plainworks": "./dist/create-plainworks.js" },
      files: ["dist", "examples"],
      scripts: {
        build: "bun scripts/bundle.ts && tsdown",
        typecheck: "tsc --noEmit",
        test: "vitest run --coverage",
        "check-packaging": "plainworks-release check-packaging",
      },
      devDependencies: PACKAGE_PRESETS,
    }),
    "packages/create-plainworks/tsconfig.json": "{}",
    "packages/create-plainworks/tsdown.config.ts": "",
    "packages/create-plainworks/vitest.config.ts": TEST_CONFIG,
    "internal/release/package.json": json({
      name: "@plainworks/release",
      private: true,
      type: "module",
      bin: { "plainworks-release": "./src/cli.ts" },
      scripts: { typecheck: "tsc --noEmit", test: "vitest run --coverage" },
      devDependencies: { "@plainworks/vitest-config": "workspace:*" },
    }),
    "internal/release/tsconfig.json": json({ extends: "../../tsconfig.tool.json" }),
    "internal/release/vitest.config.ts": TEST_CONFIG,
    "internal/release/src/cli.ts": "#!/usr/bin/env -S bun --conditions=@plainworks/source\n",
    "apps/web/package.json": json({
      name: "web",
      private: true,
      type: "module",
      scripts: { build: "vite build", typecheck: "tsc --noEmit", test: "vitest run" },
      dependencies: { "@plainworks/ui": "workspace:*" },
      devDependencies: {
        "@plainworks/testkit": "workspace:*",
        "@plainworks/vitest-config": "workspace:*",
      },
    }),
    "apps/web/tsconfig.json": json({ extends: "../../tsconfig.app.json" }),
    "apps/web/vitest.config.ts": APP_TEST_CONFIG,
    "apps/web/src/main.tsx": "",
  }
}

/** The builds the {@link shapedRepo} workspaces declare in their `tsdown.config.ts`. */
export function shapedBuilds(): Record<string, PackageBuild | CliBuild> {
  return {
    "packages/std": { entry: { index: "src/index.ts" } },
    "packages/ui": {
      entry: { index: "src/index.ts" },
      assets: { "styles.css": { generatedBy: "scripts/styles.ts" } },
      files: ["registry.json"],
    },
    "packages/create-plainworks": {
      bin: { "create-plainworks": "src/bin.ts" },
      files: ["examples"],
    },
  }
}

/** The configs the {@link shapedRepo} workspaces export from their `vitest.config.ts`. */
export function shapedTestConfigs(): Record<string, unknown> {
  return {
    "packages/std": testConfig(),
    "packages/ui": testConfig(),
    "packages/create-plainworks": testConfig(),
    "internal/release": testConfig(),
    "apps/web": appTestConfig(),
  }
}

/** A {@link ConfigLoader} that serves builds and Vitest configs from maps keyed by directory. */
export function memoryConfigLoader(
  builds: Readonly<Record<string, unknown>> = shapedBuilds(),
  tests: Readonly<Record<string, unknown>> = shapedTestConfigs(),
): ConfigLoader {
  return { build: async (dir) => builds[dir], test: async (dir) => tests[dir] }
}

/** Pretty JSON, the way the repository formats manifests. */
export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

const PACKAGE_PRESETS = {
  "@plainworks/tsdown-config": "workspace:*",
  "@plainworks/vitest-config": "workspace:*",
}
const TEST_CONFIG =
  'import { testConfig } from "@plainworks/vitest-config"\n\nexport default testConfig()\n'
const APP_TEST_CONFIG =
  'import { appTestConfig } from "@plainworks/vitest-config"\n\nexport default appTestConfig()\n'
