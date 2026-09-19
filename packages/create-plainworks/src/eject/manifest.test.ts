import { describe, expect, it } from "vitest"
import type { PackageManifest } from "../scaffold/manifest"
import { DEFAULT_TEMPLATE_NAME, TEMPLATE_DESCRIPTION, toTemplateManifest } from "./manifest"

// The manifest half of eject drops the source app's test wiring and standalone-names it, while
// leaving the dependency ranges untouched for the runtime version rewrite to pin.

function appManifest(): PackageManifest {
  return {
    name: "@plainworks/next-starter",
    version: "0.0.0",
    description: "The gated source app.",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      typecheck: "next typegen && tsc --noEmit",
      test: "vitest run",
    },
    dependencies: {
      "@plainworks/ui": "workspace:*",
      "@plainworks/testkit": "workspace:*",
      next: "catalog:",
    },
    devDependencies: {
      "@testing-library/react": "catalog:",
      "axe-core": "catalog:",
      jsdom: "catalog:",
      msw: "catalog:",
      vitest: "catalog:",
      typescript: "catalog:",
      tailwindcss: "catalog:",
    },
  } as PackageManifest
}

describe("toTemplateManifest", () => {
  it("standalone-names the manifest and resets the version", () => {
    const template = toTemplateManifest(appManifest())
    expect(template.name).toBe(DEFAULT_TEMPLATE_NAME)
    expect(template.version).toBe("0.0.0")
    expect(template.description).toBe(TEMPLATE_DESCRIPTION)
  })

  it("drops the test script but keeps the build/dev scripts", () => {
    const scripts = toTemplateManifest(appManifest()).scripts as Record<string, string>
    expect(scripts.test).toBeUndefined()
    expect(scripts.build).toBe("next build")
    expect(scripts.typecheck).toBe("next typegen && tsc --noEmit")
  })

  it("strips the test-only devDependencies but keeps the build toolchain", () => {
    const dev = toTemplateManifest(appManifest()).devDependencies ?? {}
    expect(dev["@testing-library/react"]).toBeUndefined()
    expect(dev["axe-core"]).toBeUndefined()
    expect(dev.jsdom).toBeUndefined()
    expect(dev.msw).toBeUndefined()
    expect(dev.vitest).toBeUndefined()
    expect(dev.typescript).toBe("catalog:")
    expect(dev.tailwindcss).toBe("catalog:")
  })

  it("preserves the workspace/catalog dependency ranges for the runtime pin", () => {
    const deps = toTemplateManifest(appManifest()).dependencies ?? {}
    expect(deps["@plainworks/ui"]).toBe("workspace:*")
    expect(deps["@plainworks/testkit"]).toBe("workspace:*")
    expect(deps.next).toBe("catalog:")
  })

  it("does not mutate the input manifest", () => {
    const original = appManifest()
    toTemplateManifest(original)
    expect(original.name).toBe("@plainworks/next-starter")
    expect((original.scripts as Record<string, string>).test).toBe("vitest run")
  })
})
