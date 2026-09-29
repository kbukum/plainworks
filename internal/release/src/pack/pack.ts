import { ReleaseToolError } from "../error"
import { assetSubpaths, hasExports, publishedManifest } from "./manifest"

/** The outcome of one external command: its exit code and combined output. */
export interface RunResult {
  readonly code: number
  readonly output: string
}

/** Reads and writes a gzipped npm tarball as a map of entry path to bytes. */
export interface TarballArchive {
  read(bytes: Uint8Array): Promise<Map<string, Uint8Array>>
  write(files: ReadonlyMap<string, Uint8Array>): Promise<Uint8Array>
}

/**
 * The process, disk, and archive access packing needs. Tests pass fakes; the CLI passes the Bun
 * binding.
 */
export interface PackTools {
  run(command: string, args: readonly string[], cwd: string): Promise<RunResult>
  /** Creates a fresh, empty directory for scratch output and returns its path. */
  tempDir(): Promise<string>
  readFile(path: string): Promise<Uint8Array>
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  readonly archive: TarballArchive
}

const MANIFEST_ENTRY = "package/package.json"

/** A packed workspace: the tarball's path and the manifest it publishes. */
export interface PackedWorkspace {
  readonly tarball: string
  readonly manifest: string
}

/**
 * Packs the workspace in `dir` and writes the tarball npm publishes into `destination`. Bun packs
 * it (resolving `catalog:` and `workspace:*`), then the manifest inside the tarball loses the
 * source condition. The workspace's own `package.json` is never touched.
 */
export async function packWorkspace(
  dir: string,
  destination: string,
  tools: PackTools,
): Promise<PackedWorkspace> {
  const scratch = await tools.tempDir()
  const packed = await tools.run("bun", ["pm", "pack", "--quiet", "--destination", scratch], dir)
  if (packed.code !== 0)
    throw new ReleaseToolError(`bun pm pack failed in ${dir}:\n${packed.output}`)
  const raw = packed.output.trim().split("\n").at(-1) ?? ""
  const files = await tools.archive.read(await tools.readFile(raw))
  const manifest = files.get(MANIFEST_ENTRY)
  if (manifest === undefined) throw new ReleaseToolError(`${raw} has no ${MANIFEST_ENTRY}`)
  const published = publishedManifest(new TextDecoder().decode(manifest))
  files.set(MANIFEST_ENTRY, new TextEncoder().encode(published))
  const tarball = `${destination}/${raw.split("/").at(-1)}`
  await tools.writeFile(tarball, await tools.archive.write(files))
  return { tarball, manifest: published }
}

/**
 * Packs the workspace in `dir` the way the release does and checks the tarball consumers get:
 * `publint --strict` for the manifest and files, and `attw` for the types of each JS export. Both
 * run even when the first fails, so one pass reports every problem.
 */
export async function checkPackaging(dir: string, tools: PackTools): Promise<RunResult> {
  const { tarball, manifest } = await packWorkspace(dir, await tools.tempDir(), tools)
  const checks: RunResult[] = [await tools.run("publint", ["--strict", tarball], dir)]
  if (hasExports(manifest)) {
    const assets = assetSubpaths(manifest)
    const exclude = assets.length > 0 ? ["--exclude-entrypoints", ...assets] : []
    checks.push(await tools.run("attw", [tarball, "--profile", "esm-only", ...exclude], dir))
  }
  return {
    code: checks.some((check) => check.code !== 0) ? 1 : 0,
    output: checks.map((check) => check.output).join(""),
  }
}
