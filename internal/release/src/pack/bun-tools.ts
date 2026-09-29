import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackTools } from "./pack"

// The checkers are this tool's own dependencies, so their bins resolve from its `node_modules`
// wherever the command runs.
const TOOL_BINS = join(import.meta.dirname, "..", "..", "node_modules", ".bin")

/** {@link PackTools} bound to the real process, disk, and Bun's tarball support. */
export function bunPackTools(): PackTools {
  return {
    async run(command, args, cwd) {
      const child = Bun.spawn([command, ...args], {
        cwd,
        env: { ...process.env, PATH: `${TOOL_BINS}:${process.env.PATH ?? ""}` },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { code, output: `${stdout}${stderr}` }
    },
    tempDir: () => mkdtemp(join(tmpdir(), "plainworks-pack-")),
    readFile: (path) => Bun.file(path).bytes(),
    async writeFile(path, bytes) {
      await Bun.write(path, bytes)
    },
    archive: {
      async read(bytes) {
        const entries = await new Bun.Archive(bytes).files()
        const files = new Map<string, Uint8Array>()
        for (const [path, file] of entries) files.set(path, await file.bytes())
        return files
      },
      async write(files) {
        return new Bun.Archive(Object.fromEntries(files), { compress: "gzip" }).bytes()
      },
    },
  }
}
