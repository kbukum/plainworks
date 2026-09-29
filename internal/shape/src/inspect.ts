import { isRecord } from "@plainworks/std"
import {
  assertCliBuild,
  assertPackageBuild,
  type CliBuild,
  type PackageBuild,
} from "@plainworks/tsdown-config"
import { listWorkspaces, type Manifest, type WorkspaceFiles } from "@plainworks/workspace"
import ts from "typescript"
import { ShapeError } from "./error"
import { inferKind } from "./profile/kind"

/**
 * Loads the config modules a workspace declares. Each method returns `undefined` when the workspace
 * has no such file.
 */
export interface ConfigLoader {
  /** The `build` export of `<dir>/tsdown.config.ts`. */
  build(dir: string): Promise<unknown>
  /** The default export of `<dir>/vitest.config.ts`: the effective Vitest config. */
  test(dir: string): Promise<unknown>
}

interface Facts {
  /** Repo-relative directory, e.g. `packages/std`. */
  readonly dir: string
  readonly manifest: Manifest
  /** Names of the files directly inside the workspace. */
  readonly rootFiles: readonly string[]
  /** Names of the directories directly inside the workspace. */
  readonly rootDirectories: readonly string[]
  /** Every `tsconfig*.json` in the workspace, parsed, by file name. */
  readonly tsconfigs: ReadonlyMap<string, Manifest>
  /** The text of `vitest.config.ts`, when there is one. */
  readonly vitestSource: string | undefined
  /** The config `vitest.config.ts` exports, when there is one. */
  readonly vitestConfig: unknown
  /** The text of `src/<name>`, when it exists: the files a tool's entry points come from. */
  readSource(name: string): string | undefined
}

/** What the shape rules read about one workspace, by its profile kind. */
export type WorkspaceFacts =
  | (Facts & { readonly kind: "package"; readonly build: PackageBuild })
  | (Facts & { readonly kind: "cli"; readonly build: CliBuild })
  | (Facts & { readonly kind: "tool" | "app" })

/** Reads every workspace in the repository, sorted by directory. */
export async function inspectWorkspaces(
  files: WorkspaceFiles,
  configs: ConfigLoader,
): Promise<WorkspaceFacts[]> {
  const inspected: WorkspaceFacts[] = []
  for (const { dir, manifest } of listWorkspaces(files)) {
    inspected.push(await inspectWorkspace(files, configs, dir, manifest))
  }
  return inspected
}

async function inspectWorkspace(
  files: WorkspaceFiles,
  configs: ConfigLoader,
  dir: string,
  manifest: Manifest,
): Promise<WorkspaceFacts> {
  const rootFiles = files.listFiles(dir)
  const vitestSource = files.readText(`${dir}/vitest.config.ts`)
  const facts: Facts = {
    dir,
    manifest,
    rootFiles,
    rootDirectories: files.listDirectories(dir),
    tsconfigs: readTsconfigs(files, dir, rootFiles),
    vitestSource,
    vitestConfig: vitestSource === undefined ? undefined : await configs.test(dir),
    readSource: (name) => files.readText(`${dir}/src/${name}`),
  }
  const build = rootFiles.includes("tsdown.config.ts") ? await configs.build(dir) : undefined
  const kind = inferKind(dir, build !== undefined)
  if (kind === "package") {
    if (build === undefined) throw new ShapeError(`${dir} has no tsdown.config.ts build`)
    if (isPackageBuild(build)) {
      assertPackageBuild(build)
      return { ...facts, kind: "package", build }
    }
    if (isCliBuild(build)) {
      assertCliBuild(build)
      return { ...facts, kind: "cli", build }
    }
    throw new ShapeError(`${dir}: tsdown.config.ts exports no valid \`build\``)
  }
  return { ...facts, kind }
}

function isPackageBuild(value: unknown): value is PackageBuild {
  return isRecord(value) && isStringRecord(value.entry)
}

function isCliBuild(value: unknown): value is CliBuild {
  return isRecord(value) && isStringRecord(value.bin)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string")
}

function readTsconfigs(
  files: WorkspaceFiles,
  dir: string,
  rootFiles: readonly string[],
): Map<string, Manifest> {
  const tsconfigs = new Map<string, Manifest>()
  for (const name of rootFiles.filter((file) => /^tsconfig(\..+)?\.json$/.test(file))) {
    const path = `${dir}/${name}`
    const { config, error } = ts.parseConfigFileTextToJson(path, files.readText(path) ?? "")
    if (error !== undefined || !isRecord(config)) {
      throw new ShapeError(`${path} is not a valid tsconfig`)
    }
    tsconfigs.set(name, config)
  }
  return tsconfigs
}
