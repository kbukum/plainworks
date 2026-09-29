import type { PackTools, RunResult } from "./pack"

const THEME_MANIFEST = JSON.stringify({
  name: "@plainworks/theme",
  exports: {
    ".": {
      "@plainworks/source": "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
    "./styles.css": "./dist/styles.css",
  },
})

/** An in-memory {@link PackTools} that records each command it runs. */
export interface MemoryPackTools extends PackTools {
  readonly calls: string[]
  readonly written: Map<string, Uint8Array>
}

/**
 * An in-memory {@link PackTools}: Bun "packs" a `@plainworks/theme` tarball holding `manifest`, and
 * every other command succeeds unless `results` gives its outcome.
 */
export function memoryPackTools(
  options: { manifest?: string; results?: Record<string, RunResult> } = {},
): MemoryPackTools {
  const calls: string[] = []
  const written = new Map<string, Uint8Array>()
  const encoder = new TextEncoder()
  const packed = new Map<string, Uint8Array>([
    ["package/package.json", encoder.encode(options.manifest ?? THEME_MANIFEST)],
    ["package/dist/index.js", encoder.encode("export {}")],
  ])
  return {
    calls,
    written,
    async run(command, args, cwd) {
      calls.push(`${cwd}$ ${command} ${args.join(" ")}`)
      if (command === "bun")
        return { code: 0, output: "noise\n/tmp/raw/plainworks-theme-0.1.0.tgz\n" }
      return options.results?.[command] ?? { code: 0, output: `${command} ok\n` }
    },
    async tempDir() {
      return "/tmp/raw"
    },
    async readFile(path) {
      if (path !== "/tmp/raw/plainworks-theme-0.1.0.tgz") throw new Error(`unexpected read ${path}`)
      return encoder.encode("raw")
    },
    async writeFile(path, bytes) {
      written.set(path, bytes)
    },
    archive: {
      async read() {
        return new Map(packed)
      },
      async write(files) {
        const manifest = new TextDecoder().decode(files.get("package/package.json"))
        return encoder.encode(`${[...files.keys()].join(",")}|${manifest}`)
      },
    },
  }
}
