import { describe, expect, it } from "vitest"
import { rewriteManifest, UnresolvedDependencyError } from "./manifest"

const resolvers = {
  plainworksVersions: { "@plainworks/app": "0.1.0-alpha.1", "@plainworks/ui": "0.1.0-alpha.1" },
  catalogVersions: { react: "^19.2.8", next: "^16.3.5" },
}

describe("rewriteManifest", () => {
  it("pins workspace and catalog ranges and sets the project name", () => {
    const result = rewriteManifest(
      {
        name: "@plainworks/next-host",
        version: "0.0.0",
        dependencies: {
          "@plainworks/app": "workspace:*",
          "@plainworks/ui": "workspace:*",
          next: "catalog:",
          react: "catalog:",
        },
      },
      { projectName: "my-app", ...resolvers },
    )

    expect(result.name).toBe("my-app")
    expect(result.version).toBe("0.0.0")
    expect(result.dependencies).toEqual({
      "@plainworks/app": "0.1.0-alpha.1",
      "@plainworks/ui": "0.1.0-alpha.1",
      next: "^16.3.5",
      react: "^19.2.8",
    })
  })

  it("pins every dependency section", () => {
    const result = rewriteManifest(
      {
        name: "t",
        devDependencies: { next: "catalog:" },
        peerDependencies: { react: "catalog:" },
      },
      { projectName: "my-app", ...resolvers },
    )

    expect(result.devDependencies).toEqual({ next: "^16.3.5" })
    expect(result.peerDependencies).toEqual({ react: "^19.2.8" })
  })

  it("leaves an already-concrete range untouched", () => {
    const result = rewriteManifest(
      { name: "t", dependencies: { "some-lib": "^1.2.3" } },
      { projectName: "my-app", ...resolvers },
    )

    expect(result.dependencies).toEqual({ "some-lib": "^1.2.3" })
  })

  it("does not mutate the input manifest", () => {
    const template = { name: "t", dependencies: { next: "catalog:" } }
    rewriteManifest(template, { projectName: "my-app", ...resolvers })

    expect(template.dependencies.next).toBe("catalog:")
  })

  it("throws for a workspace dependency with no known version", () => {
    expect(() =>
      rewriteManifest(
        { name: "t", dependencies: { "@plainworks/unknown": "workspace:*" } },
        { projectName: "my-app", ...resolvers },
      ),
    ).toThrow(UnresolvedDependencyError)
  })

  it("throws for a catalog dependency absent from the catalog", () => {
    expect(() =>
      rewriteManifest(
        { name: "t", dependencies: { "ghost-lib": "catalog:" } },
        { projectName: "my-app", ...resolvers },
      ),
    ).toThrow(UnresolvedDependencyError)
  })
})
