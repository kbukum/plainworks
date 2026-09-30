import { describe, expect, it } from "vitest"
import { type Artifact, type ExclusionRule, scanArtifacts, sourcesOf } from "./scan"

const rule: ExclusionRule = {
  forbiddenSources: ["/repo/packages/devtools/"],
  markers: ["plainworks-devtools", "plainworksDevtools"],
  expectedSources: ["/repo/apps/web/src/"],
  allowUnmapped: [],
}

function map(sources: readonly string[]): string {
  return JSON.stringify({ version: 3, sources, mappings: "" })
}

/** An app chunk and its map, so the positive control is satisfied unless a test removes it. */
const app: readonly Artifact[] = [
  { path: "/repo/apps/web/dist/app.js", text: "console.log(1)" },
  { path: "/repo/apps/web/dist/app.js.map", text: map(["../src/main.ts"]) },
]

function leaksOf(artifacts: readonly Artifact[]) {
  return scanArtifacts([...app, ...artifacts], rule).leaks
}

describe("sourcesOf", () => {
  it("reads a flat map and a Turbopack index map", () => {
    expect(sourcesOf(map(["../src/a.ts"]), "/app/dist/a.js.map")).toEqual(["/app/src/a.ts"])
    const indexed = JSON.stringify({
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: { version: 3, sources: ["turbopack:///[project]/b.ts"] },
        },
      ],
    })
    expect(sourcesOf(indexed, "/app/b.js.map")).toEqual(["turbopack:///[project]/b.ts"])
  })

  it("resolves sources against the sourceRoot and Windows separators", () => {
    const text = JSON.stringify({ version: 3, sourceRoot: "../", sources: ["src\\c.ts"] })
    expect(sourcesOf(text, "/app/dist/c.js.map")).toEqual(["/app/src/c.ts"])
  })

  it("rejects text that is not a source map", () => {
    expect(() => sourcesOf("{}", "x.js.map")).toThrow("x.js.map is not a version 3 source map")
  })

  it("rejects a version 3 map whose sources or sections are missing or malformed", () => {
    const malformed = [
      '{"version":3}',
      '{"version":3,"sources":"a.ts"}',
      '{"version":3,"sources":["a.ts",1]}',
      '{"version":3,"sections":[{"offset":{}}]}',
      '{"version":3,"sources":[],"sections":{}}',
    ]
    for (const text of malformed) {
      expect(() => sourcesOf(text, "y.js.map")).toThrow(
        'y.js.map has no valid "sources" or "sections"',
      )
    }
  })

  it("accepts an empty map, which Turbopack emits for a loader stub", () => {
    expect(sourcesOf('{"version":3,"sources":[],"sections":[]}', "z.js.map")).toEqual([])
    expect(sourcesOf('{"version":3,"sources":[null,"a.ts"]}', "/z.js.map")).toEqual(["/a.ts"])
  })
})

describe("scanArtifacts", () => {
  it("passes a clean build", () => {
    expect(
      scanArtifacts([...app, { path: "/repo/apps/web/dist/app.css", text: ".btn{}" }], rule),
    ).toEqual({
      leaks: [],
      unmapped: [],
    })
  })

  // The case marker strings miss: an adapter-only graph that a minifier leaves with no telltale
  // literal. Only the recorded source paths reveal it.
  it("catches a minified adapter by its recorded source path", () => {
    const source = "turbopack:///[project]/packages/devtools/dist/adapters/http/http-source.js"
    expect(
      leaksOf([
        { path: "chunk.js", text: "var a=b=>c=>d(c)" },
        { path: "chunk.js.map", text: map([source]) },
      ]),
    ).toEqual([{ kind: "source", file: "chunk.js.map", source }])
  })

  it("catches an installed package resolved from a relative source", () => {
    const installed = {
      ...rule,
      forbiddenSources: ["/repo/apps/web/node_modules/@plainworks/devtools/"],
    }
    const leaks = scanArtifacts(
      [
        ...app,
        {
          path: "/repo/apps/web/dist/a.js.map",
          text: map(["../node_modules/@plainworks/devtools/dist/index.js"]),
        },
      ],
      installed,
    ).leaks
    expect(leaks).toEqual([
      {
        kind: "source",
        file: "/repo/apps/web/dist/a.js.map",
        source: "/repo/apps/web/node_modules/@plainworks/devtools/dist/index.js",
      },
    ])
  })

  it("follows a sourceMappingURL comment and reads an inline data-URL map", () => {
    const inline = Buffer.from(map(["../../../packages/devtools/src/index.ts"])).toString("base64")
    const result = scanArtifacts(
      [
        ...app,
        { path: "/repo/apps/web/dist/chunks/a1.js", text: "x()\n//# sourceMappingURL=b2.js.map" },
        { path: "/repo/apps/web/dist/chunks/b2.js.map", text: map(["../../src/page.ts"]) },
        {
          path: "/repo/apps/web/dist/c.js",
          text: `x()\n//# sourceMappingURL=data:application/json;base64,${inline}`,
        },
      ],
      rule,
    )
    expect(result.unmapped).toEqual([])
    expect(result.leaks).toEqual([
      {
        kind: "source",
        file: "/repo/apps/web/dist/c.js",
        source: "/repo/packages/devtools/src/index.ts",
      },
    ])
  })

  it("catches the stylesheet sentinel in CSS, which has no map", () => {
    expect(
      leaksOf([{ path: "app.css", text: "[data-plainworks-devtools]{--plainworks-devtools:1}" }]),
    ).toEqual([{ kind: "marker", file: "app.css", marker: "plainworks-devtools" }])
  })

  it("follows a URL-encoded sourceMappingURL", () => {
    const result = scanArtifacts(
      [
        ...app,
        {
          path: "/repo/apps/web/dist/[root]__a.js",
          text: "x()\n//# sourceMappingURL=%5Broot%5D__a.js.map",
        },
        { path: "/repo/apps/web/dist/[root]__a.js.map", text: map(["../src/page.ts"]) },
      ],
      rule,
    )
    expect(result).toEqual({ leaks: [], unmapped: [] })
  })

  // A minified chunk without a map can hide forbidden code no marker survives in, so it fails
  // unless the host names it as a known runtime, manifest, or prebuilt polyfill.
  it("fails a script with no map that the host has not allowed", () => {
    expect(leaksOf([{ path: "/repo/apps/web/dist/lazy.js", text: "x()" }])).toEqual([
      { kind: "unmapped", file: "/repo/apps/web/dist/lazy.js" },
    ])
  })

  it("marker-checks an allowed unmapped script and reports it", () => {
    const allowed = { ...rule, allowUnmapped: ["/repo/apps/web/dist/polyfill.js"] }
    const result = scanArtifacts(
      [...app, { path: "/repo/apps/web/dist/polyfill.js", text: "plainworksDevtools" }],
      allowed,
    )
    expect(result.unmapped).toEqual(["/repo/apps/web/dist/polyfill.js"])
    expect(result.leaks).toEqual([
      { kind: "marker", file: "/repo/apps/web/dist/polyfill.js", marker: "plainworksDevtools" },
    ])
  })

  it("fails when the maps do not show the app's own modules", () => {
    expect(scanArtifacts([{ path: "app.js", text: "" }], rule).leaks).toEqual([
      { kind: "unmapped", file: "app.js" },
      { kind: "blind", path: "/repo/apps/web/src/" },
    ])
  })

  it("forbids a folder inside the app's own sources", () => {
    const hosted = { ...rule, forbiddenSources: ["/repo/apps/web/src/client/dev-tools/"] }
    const leaks = scanArtifacts(
      [
        ...app,
        { path: "/repo/apps/web/dist/b.js.map", text: map(["../src/client/dev-tools/seams.ts"]) },
      ],
      hosted,
    ).leaks
    expect(leaks.map((leak) => leak.kind)).toEqual(["source"])
  })

  // Turbopack records `turbopack:///[project]/<path>`, where the project root is the app or one of
  // its ancestors, so a source matches when some ancestor of the directory completes the path.
  it("matches a Turbopack project source against the directory it resolves under", () => {
    const own = "turbopack:///[project]/apps/web/src/page.tsx"
    const other = "turbopack:///[project]/apps/other/src/client/dev-tools/x.ts"
    const hosted = { ...rule, forbiddenSources: ["/repo/apps/web/src/client/dev-tools/"] }
    const result = scanArtifacts(
      [
        { path: "/repo/apps/web/dist/a.js", text: "x()" },
        { path: "/repo/apps/web/dist/a.js.map", text: map([own, other]) },
      ],
      hosted,
    )
    expect(result.leaks).toEqual([])
  })

  it("matches a forbidden file exactly, not a longer name it prefixes", () => {
    const hosted = { ...rule, forbiddenSources: ["/repo/apps/web/src/secret.ts"] }
    const scan = (source: string) =>
      scanArtifacts(
        [...app, { path: "/repo/apps/web/dist/b.js.map", text: map([source]) }],
        hosted,
      ).leaks.map((leak) => leak.kind)
    expect(scan("../src/secret.ts.backup")).toEqual([])
    expect(scan("turbopack:///[project]/apps/web/src/secret.ts.backup")).toEqual([])
    expect(scan("../src/secret.ts")).toEqual(["source"])
    expect(scan("turbopack:///[project]/apps/web/src/secret.ts")).toEqual(["source"])
  })

  it("does not treat a sibling folder that shares a name prefix as inside the directory", () => {
    const leaks = leaksOf([
      { path: "/repo/apps/web/dist/b.js.map", text: map(["../../../packages/devtools-lite/a.ts"]) },
    ])
    expect(leaks).toEqual([])
  })

  it("allows unmapped scripts by glob, with `*` inside one segment and `**` across segments", () => {
    const allowed = {
      ...rule,
      allowUnmapped: [
        "/repo/apps/web/dist/assets/runtime-*.js",
        "/repo/apps/web/dist/**/*-manifest.js",
      ],
    }
    const result = scanArtifacts(
      [
        ...app,
        { path: "/repo/apps/web/dist/assets/runtime-Ab1.js", text: "" },
        { path: "/repo/apps/web/dist/app/[...path]/route_client-reference-manifest.js", text: "" },
        { path: "/repo/apps/web/dist/build-manifest.js", text: "" },
        { path: "/repo/apps/web/dist/assets/nested/runtime-Ab1.js", text: "" },
      ],
      allowed,
    )
    expect(result.unmapped).toEqual([
      "/repo/apps/web/dist/assets/runtime-Ab1.js",
      "/repo/apps/web/dist/app/[...path]/route_client-reference-manifest.js",
      "/repo/apps/web/dist/build-manifest.js",
    ])
    expect(result.leaks).toEqual([
      { kind: "unmapped", file: "/repo/apps/web/dist/assets/nested/runtime-Ab1.js" },
    ])
  })
})
