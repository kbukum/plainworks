import { realpathSync } from "node:fs"
import { join } from "node:path"
import { createLogger, createServer, type ViteDevServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { plainworksSource } from "./plugin"
import { type FixtureTree, KIT_FILES, writeTree } from "./testing"

let tree: FixtureTree | undefined
let server: ViteDevServer | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
  tree?.remove()
})

async function serve(installedVersion: string) {
  tree = writeTree({
    ...KIT_FILES,
    "app/index.html": "<!doctype html>",
    "app/node_modules/@plainworks/ui/package.json": {
      name: "@plainworks/ui",
      version: installedVersion,
    },
  })
  const warnings: string[] = []
  const logger = createLogger("silent")
  logger.warn = (message) => void warnings.push(message)
  server = await createServer({
    configFile: false,
    root: join(tree.root, "app"),
    customLogger: logger,
    server: { middlewareMode: true, ws: false },
    plugins: [plainworksSource({ checkout: "../kit", dedupe: ["react-dom"] })],
  })
  return { server, warnings, kit: join(tree.root, "kit") }
}

describe("plainworksSource", () => {
  it("resolves kit imports to the checkout, dedupes peers and serves the checkout", async () => {
    const { server, warnings, kit } = await serve("0.2.0")
    const resolved = await server.pluginContainer.resolveId("@plainworks/ui", undefined)
    expect(resolved?.id).toBe(join(kit, "packages/ui/src/index.ts"))
    expect(server.config.resolve.dedupe).toEqual(
      expect.arrayContaining(["@tanstack/react-query", "react", "react-dom"]),
    )
    expect(server.config.server.fs.allow).toContain(kit)
    expect(server.config.optimizeDeps.exclude).toEqual(
      expect.arrayContaining(["@plainworks/std", "@plainworks/ui"]),
    )
    expect(warnings).toEqual([])
  })

  it("loads a kit module whose own kit imports also resolve from source", async () => {
    const { server } = await serve("0.2.0")
    const ui = await server.ssrLoadModule("@plainworks/ui")
    expect(ui.std).toBe("source")
  })

  it("links kit stylesheets for CSS resolvers, which skip plugin resolveId", async () => {
    const { server, kit } = await serve("0.2.0")
    // Tailwind and Vite's own CSS @import resolve through createResolver, not the plugin pipeline.
    const resolveCss = server.config.createResolver({ extensions: [".css"], mainFields: ["style"] })
    const importer = join(server.config.root, "src/styles.css")
    expect(await resolveCss("@plainworks/ui/styles.css", importer)).toBe(
      join(kit, "packages/ui/src/styles.css"),
    )
    expect(await resolveCss("@plainworks/ui/tokens.css", importer)).toBe(
      join(kit, "packages/ui/dist/tokens.css"),
    )
  })

  it("resolves a kit file's third-party imports from the app, as a packed install would", async () => {
    tree = writeTree({
      ...KIT_FILES,
      "app/index.html": "<!doctype html>",
      "app/node_modules/shared-dep/package.json": { name: "shared-dep", main: "index.js" },
      "app/node_modules/shared-dep/index.js": "export const from = 'app'\n",
      "kit/packages/ui/node_modules/shared-dep/package.json": {
        name: "shared-dep",
        main: "index.js",
      },
      "kit/packages/ui/node_modules/shared-dep/index.js": "export const from = 'kit'\n",
      "kit/packages/ui/node_modules/kit-only/package.json": { name: "kit-only", main: "index.js" },
      "kit/packages/ui/node_modules/kit-only/index.js": "export const from = 'kit'\n",
    })
    server = await createServer({
      configFile: false,
      root: join(tree.root, "app"),
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [plainworksSource({ checkout: "../kit" })],
    })
    const root = realpathSync(tree.root)
    const kitFile = join(root, "kit/packages/ui/src/index.ts")
    const shared = await server.pluginContainer.resolveId("shared-dep", kitFile, { ssr: true })
    expect(shared?.id).toBe(join(root, "app/node_modules/shared-dep/index.js"))
    const kitOnly = await server.pluginContainer.resolveId("kit-only", kitFile, { ssr: true })
    expect(kitOnly?.id).toBe(join(root, "kit/packages/ui/node_modules/kit-only/index.js"))
  })

  it("warns when the installed kit differs from the checkout", async () => {
    const { warnings } = await serve("0.1.0")
    expect(warnings.join("\n")).toMatch(/@plainworks\/ui 0\.1\.0→0\.2\.0/)
  })

  it("loads one React for the app and the linked kit, so context crosses the boundary", async () => {
    const react = (from: string) => ({
      [`${from}/package.json`]: { name: "react", version: "19.0.0", main: "index.js" },
      [`${from}/index.js`]: `export const createContext = (value) => ({ value, from: "${from}" })\n`,
    })
    tree = writeTree({
      ...KIT_FILES,
      ...react("app/node_modules/react"),
      // The checkout's own install has a second copy; a packed install would not.
      ...react("kit/packages/ui/node_modules/react"),
      "app/index.html": "<!doctype html>",
      "app/src/context.ts":
        "import { createContext } from 'react'\nexport const Theme = createContext('app')\nexport { createContext }\n",
      "kit/packages/ui/src/index.ts":
        "import { createContext } from 'react'\nexport { std } from '@plainworks/std'\nexport { createContext }\n",
    })
    server = await createServer({
      configFile: false,
      root: join(tree.root, "app"),
      logLevel: "silent",
      server: { middlewareMode: true, ws: false },
      plugins: [plainworksSource({ checkout: "../kit" })],
    })
    const app = await server.ssrLoadModule("/src/context.ts")
    const ui = await server.ssrLoadModule("@plainworks/ui")
    expect(ui.createContext).toBe(app.createContext)
    expect(app.Theme.from).toBe("app/node_modules/react")
  })

  it("finds dependencies hoisted above the app, as Node resolution does", async () => {
    tree = writeTree({
      ...KIT_FILES,
      "app/index.html": "<!doctype html>",
      "node_modules/shared-dep/package.json": { name: "shared-dep", version: "1.0.0" },
      "node_modules/@plainworks/ui/package.json": { name: "@plainworks/ui", version: "0.1.0" },
    })
    const warnings: string[] = []
    const logger = createLogger("silent")
    logger.warn = (message) => void warnings.push(message)
    server = await createServer({
      configFile: false,
      root: join(tree.root, "app"),
      customLogger: logger,
      server: { middlewareMode: true, ws: false },
      plugins: [plainworksSource({ checkout: "../kit" })],
    })
    expect(server.config.resolve.dedupe).toContain("shared-dep")
    expect(warnings.join("\n")).toMatch(/@plainworks\/ui 0\.1\.0→0\.2\.0/)
  })

  it("fails fast when the checkout is missing", async () => {
    tree = writeTree({ "app/index.html": "" })
    await expect(
      createServer({
        configFile: false,
        root: join(tree.root, "app"),
        logLevel: "silent",
        server: { middlewareMode: true, ws: false },
        plugins: [plainworksSource({ checkout: "../kit" })],
      }),
    ).rejects.toMatchObject({ kind: "vite/checkout-missing" })
  })
})
