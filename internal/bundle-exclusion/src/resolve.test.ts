import { posix } from "node:path"
import { describe, expect, test } from "vitest"
import { BundleExclusionError } from "./error"
import { type ResolveEnvironment, resolveRule } from "./resolve"
import type { RuleSpec } from "./rules"

const APP = "/repo/apps/web"

const empty: RuleSpec = {
  forbiddenSources: [],
  markers: [],
  expectedSources: [],
  allowUnmapped: [],
}

function environment(files: Record<string, string> = {}, links: Record<string, string> = {}) {
  const env: ResolveEnvironment = {
    join: posix.join,
    dirname: posix.dirname,
    exists: (path) => path in links || path in files,
    realpath: (path) => links[path] ?? path,
    readText: (path) => {
      const text = files[path]
      if (text === undefined) throw new Error(`ENOENT ${path}`)
      return text
    },
  }
  return env
}

describe("resolveRule", () => {
  test("resolves app paths against the config directory and keeps the directory slash", () => {
    const rule = resolveRule(
      { ...empty, expectedSources: ["./src/"], forbiddenSources: ["./src/client/dev-tools/"] },
      APP,
      environment(),
    )
    expect(rule.expectedSources).toEqual(["/repo/apps/web/src/"])
    expect(rule.forbiddenSources).toEqual(["/repo/apps/web/src/client/dev-tools/"])
  })

  // A workspace link and a registry install resolve to different real folders; naming the package
  // keeps the host config the same in both.
  test("resolves a package path through the nearest node_modules to its real folder", () => {
    const env = environment(
      {},
      {
        "/repo/node_modules/@plainworks/devtools": "/repo/packages/devtools",
        "/repo/apps/web/node_modules/lodash": "/repo/apps/web/node_modules/lodash",
      },
    )
    const rule = resolveRule(
      {
        ...empty,
        expectedSources: ["lodash/es/"],
        forbiddenSources: ["@plainworks/devtools", "@plainworks/devtools/src/control/"],
      },
      APP,
      env,
    )
    expect(rule.expectedSources).toEqual(["/repo/apps/web/node_modules/lodash/es/"])
    expect(rule.forbiddenSources).toEqual([
      "/repo/packages/devtools/",
      "/repo/packages/devtools/src/control/",
    ])
  })

  // A package path that resolves nowhere would check nothing, and `src/client/` without its `./`
  // reads as the package `src`, so an unresolved package fails rather than passing silently.
  test.each([
    ["forbiddenSources", "@plainworks/devtools/", "@plainworks/devtools"],
    ["expectedSources", "src/client/", "src"],
  ] as const)("rejects a %s package path that is not installed", (key, entry, name) => {
    expect(() => resolveRule({ ...empty, [key]: [entry] }, APP, environment())).toThrow(
      new BundleExclusionError(
        `"${entry}" names the package ${name}, which is not installed; start an app path with "./"`,
      ),
    )
  })

  test("resolves unmapped globs against the config directory", () => {
    const rule = resolveRule(
      { ...empty, allowUnmapped: [".out/assets/rolldown-runtime-*.js"] },
      APP,
      environment(),
    )
    expect(rule.allowUnmapped).toEqual(["/repo/apps/web/.out/assets/rolldown-runtime-*.js"])
  })

  // Next names its prebuilt polyfill by content hash; its build manifest lists it, so the host
  // points at the manifest field instead of a hash that changes every release.
  test("allows the files a bundler manifest lists, relative to the manifest", () => {
    const manifest = JSON.stringify({ polyfillFiles: ["static/chunks/0cz1.js"] })
    const rule = resolveRule(
      { ...empty, allowUnmapped: [".next/build-manifest.json#polyfillFiles"] },
      APP,
      environment({ "/repo/apps/web/.next/build-manifest.json": manifest }),
    )
    expect(rule.allowUnmapped).toEqual(["/repo/apps/web/.next/static/chunks/0cz1.js"])
  })

  test.each([
    ["{}", '.next/m.json#files: "files" must be an array of strings'],
    ['{"files":[1]}', '.next/m.json#files: "files" must be an array of strings'],
    ["[", ".next/m.json#files: cannot read the manifest"],
  ])("rejects a manifest field that is not a list of files %#", (text, message) => {
    const env = environment({ "/repo/apps/web/.next/m.json": text })
    expect(() =>
      resolveRule({ ...empty, allowUnmapped: [".next/m.json#files"] }, APP, env),
    ).toThrow(message)
  })

  test("reports a missing manifest as a build to run first, keeping the cause", () => {
    let caught: unknown
    try {
      resolveRule({ ...empty, allowUnmapped: [".next/m.json#files"] }, APP, environment())
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(BundleExclusionError)
    if (caught instanceof BundleExclusionError) {
      expect(caught.message).toBe(".next/m.json#files: cannot read the manifest")
      expect(caught.cause).toBeInstanceOf(Error)
    }
  })
})
