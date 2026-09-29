import { describe, expect, test } from "vitest"
import { type BundleExclusionEnvironment, type CommandOutput, runBundleExclusion } from "./command"

interface Fixture {
  readonly files: ReadonlyMap<string, string>
  readonly listed?: readonly string[]
  readonly listError?: Error
  readonly cwd?: string
}

function map(sources: readonly string[]): string {
  return JSON.stringify({ version: 3, sources, mappings: "" })
}

function config(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    rule: "devtools",
    directories: ["dist"],
    expectedSources: ["/repo/app/src/"],
    ...extra,
  })
}

function run(args: readonly string[], fixture: Fixture) {
  let stdout = ""
  let stderr = ""
  const output: CommandOutput = {
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
  }
  const env: BundleExclusionEnvironment = {
    cwd: () => fixture.cwd ?? "/repo/app",
    resolve: (path) => (path.startsWith("/") ? path : `/repo/app/${path}`),
    dirname: (path) => path.slice(0, path.lastIndexOf("/")) || "/",
    join: (...parts) => parts.join("/").replaceAll(/\/+/g, "/"),
    isAbsolute: (path) => path.startsWith("/"),
    relative: (from, to) => to.replace(`${from}/`, ""),
    readText: (path) => {
      const text = fixture.files.get(path)
      if (text === undefined) throw new Error(`missing ${path}`)
      return text
    },
    listArtifactFiles: () => {
      if (fixture.listError !== undefined) throw fixture.listError
      return (
        fixture.listed ??
        [...fixture.files.keys()].filter((path) => path.startsWith("/repo/app/dist/"))
      )
    },
  }
  return { code: runBundleExclusion(args, env, output), stdout, stderr }
}

describe("runBundleExclusion", () => {
  test("passes a clean build", () => {
    const result = run(["devtools-exclusion.json"], {
      files: new Map([
        ["/repo/app/devtools-exclusion.json", config()],
        ["/repo/app/dist/app.js", "console.log(1)"],
        ["/repo/app/dist/app.js.map", map(["../src/main.ts"])],
      ]),
    })

    expect(result).toEqual({
      code: 0,
      stderr: "",
      stdout:
        "devtools-exclusion.json: production build excludes devtools (2 files; 0 allowed unmapped scripts marker-checked)\n",
    })
  })

  test("lists at most twenty leaks and reports the remaining count", () => {
    const sources = Array.from(
      { length: 23 },
      (_, index) => `../../../packages/devtools/src/${index}.ts`,
    )
    const result = run(["devtools-exclusion.json"], {
      files: new Map([
        ["/repo/app/devtools-exclusion.json", config()],
        ["/repo/app/dist/app.js.map", map(["../src/main.ts", ...sources])],
      ]),
    })

    expect(result.code).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain(
      "/repo/app/dist/app.js.map bundles /packages/devtools/src/0.ts\n",
    )
    expect(result.stderr).toContain("…and 3 more\n")
    expect(result.stderr).toContain("devtools-exclusion.json: the production build is not clean\n")
  })

  test("fails when an output directory has no source maps", () => {
    const result = run(["devtools-exclusion.json"], {
      files: new Map([
        ["/repo/app/devtools-exclusion.json", config()],
        ["/repo/app/dist/app.js", "console.log(1)"],
      ]),
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "/repo/app/dist has no source maps; enable them for the production build\n",
    })
  })

  test("reports an unreadable output directory", () => {
    const result = run(["devtools-exclusion.json"], {
      files: new Map([["/repo/app/devtools-exclusion.json", config()]]),
      listError: new Error("no dist"),
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "Cannot read /repo/app/dist (Error: no dist); run the host's production build first\n",
    })
  })

  test("reports usage errors", () => {
    expect(run([], { files: new Map() })).toEqual({
      code: 2,
      stdout: "",
      stderr: "Usage: plainworks-bundle-exclusion <config.json>\n",
    })
    expect(run(["a.json", "b.json"], { files: new Map() }).code).toBe(2)
  })
})
