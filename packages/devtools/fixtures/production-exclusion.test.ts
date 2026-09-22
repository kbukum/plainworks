import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { build } from "vite"
import { afterAll, describe, expect, it } from "vitest"

/**
 * The production-exclusion proof for the host-owned development gate: a consumer that follows the
 * documented dynamic-import pattern gets the devtools JavaScript and CSS in development and
 * neither in production. The package itself never inspects the environment — the host's gate
 * does — so this fixture builds a real consumer both ways and inspects the emitted bundles.
 */

const packageRoot = new URL("..", import.meta.url).pathname
const fixtureRoot = join(packageRoot, "fixtures", "consumer")
const outDirs: string[] = []

interface ConsumerOutput {
  readonly js: readonly string[]
  readonly css: readonly string[]
}

async function buildConsumer(mode: "development" | "production"): Promise<ConsumerOutput> {
  const outDir = mkdtempSync(join(tmpdir(), `devtools-consumer-${mode}-`))
  outDirs.push(outDir)
  const development = mode === "development"
  await build({
    root: fixtureRoot,
    mode,
    logLevel: "silent",
    plugins: [tailwindcss()],
    // Vite dev serves `import.meta.env.DEV === true`; a production build replaces it with
    // `false` and eliminates the dead branch. Build mode alone does not flip this flag, so the
    // fixture defines both bundler conditions explicitly.
    define: {
      "import.meta.env.DEV": JSON.stringify(development),
      "import.meta.env.PROD": JSON.stringify(!development),
    },
    resolve: {
      alias: {
        // Consume the built package: the client, adapters, and stylesheet resolve from `dist`, so
        // the stylesheet's `@source "./**/*.js"` scans the shipped `dist/*.js` (where component
        // class names live) exactly as a real consumer's Tailwind build does. What is proven is
        // the host bundler's dead-code elimination plus the stylesheet's source directive.
        "@plainworks/devtools/client": join(packageRoot, "dist", "client.js"),
        "@plainworks/devtools/query": join(packageRoot, "dist", "query.js"),
        "@plainworks/devtools/state": join(packageRoot, "dist", "state.js"),
        "@plainworks/devtools/styles.css": join(packageRoot, "dist", "styles.css"),
        "@plainworks/devtools": join(packageRoot, "dist", "index.js"),
        "@plainworks/ui/styles.css": join(packageRoot, "..", "ui", "src", "styles.css"),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      minify: !development,
      rollupOptions: { input: join(fixtureRoot, "entry.ts") },
    },
  })
  const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
  const read = (suffix: string): string[] =>
    files
      .filter((file) => file.isFile() && file.name.endsWith(suffix))
      .map((file) => readFileSync(join(file.parentPath, file.name), "utf8"))
  return { js: read(".js"), css: read(".css") }
}

afterAll(() => {
  for (const outDir of outDirs) rmSync(outDir, { recursive: true, force: true })
})

// Two real bundler runs (development + production, the second with Tailwind and minification)
// take far longer than a unit test.
const BUILD_TIMEOUT = 120_000

describe("consumer development gate", () => {
  it("emits the devtools JavaScript and CSS in development", {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const output = await buildConsumer("development")
    expect(output.js.some((chunk) => chunk.includes("Plainworks inspector"))).toBe(true)
    expect(output.js.some((chunk) => chunk.includes("createDevtoolsSession"))).toBe(true)
    // Proof the stylesheet's `@source` scanned the devtools `dist`: `bg-popover/95` is used only by
    // the rail, so its compiled rule can only appear if devtools classes were actually collected.
    expect(output.css.some((css) => css.includes("bg-popover"))).toBe(true)
  })

  it("emits no devtools JavaScript or CSS in production", { timeout: BUILD_TIMEOUT }, async () => {
    const output = await buildConsumer("production")
    expect(output.js.some((chunk) => chunk.includes("Plainworks inspector"))).toBe(false)
    expect(output.js.some((chunk) => chunk.includes("createDevtoolsSession"))).toBe(false)
    expect(output.js.some((chunk) => chunk.includes("devtools"))).toBe(false)
    expect(output.css).toHaveLength(0)
  })
})
