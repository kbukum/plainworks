import { memoryWorkspaceFiles } from "@plainworks/workspace"
import { describe, expect, it } from "vitest"
import { readPublishableWorkspaces } from "./manifest"

const root = JSON.stringify({ workspaces: ["packages/*", "apps/*"] })

describe("readPublishableWorkspaces", () => {
  it("keeps non-private @plainworks packages and create-plainworks, with their workspace deps", () => {
    const files = memoryWorkspaceFiles({
      "package.json": root,
      "packages/std/package.json": JSON.stringify({ name: "@plainworks/std", version: "1.0.0" }),
      "packages/http/package.json": JSON.stringify({
        name: "@plainworks/http",
        version: "1.0.0",
        dependencies: { "@plainworks/std": "workspace:*" },
        peerDependencies: { react: "catalog:" },
        devDependencies: { vitest: "catalog:" },
      }),
      "packages/create-plainworks/package.json": JSON.stringify({
        name: "create-plainworks",
        version: "1.0.0",
      }),
      "packages/other/package.json": JSON.stringify({ name: "left-pad", version: "1.0.0" }),
      "apps/showcase/package.json": JSON.stringify({
        name: "@plainworks/showcase",
        version: "0.0.0",
        private: true,
      }),
      "apps/empty/README.md": "no manifest",
    })

    expect(readPublishableWorkspaces(files)).toEqual([
      { dir: "packages/create-plainworks", name: "create-plainworks", version: "1.0.0", deps: [] },
      {
        dir: "packages/http",
        name: "@plainworks/http",
        version: "1.0.0",
        deps: ["@plainworks/std", "react"],
      },
      { dir: "packages/std", name: "@plainworks/std", version: "1.0.0", deps: [] },
    ])
  })

  it("fails a publishable package without a version", () => {
    const files = memoryWorkspaceFiles({
      "package.json": root,
      "packages/std/package.json": JSON.stringify({ name: "@plainworks/std" }),
    })
    expect(() => readPublishableWorkspaces(files)).toThrow(/@plainworks\/std has no version/)
  })
})
