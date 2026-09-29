import type { UserConfig } from "tsdown"
import { assertExtraFiles, BuildShapeError } from "./build.ts"

/** What a published command-line package builds: each command and the source it runs. */
export interface CliBuild {
  /** Source by command name; the command builds to `dist/<command>.js`. */
  readonly bin: Readonly<Record<string, string>>
  /** Published files beyond `dist`, such as bundled templates. */
  readonly files?: readonly string[]
}

const COMMAND = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Throws a {@link BuildShapeError} unless `build` follows the shared command-line shape. */
export function assertCliBuild(build: CliBuild): void {
  const commands = Object.entries(build.bin)
  if (commands.length === 0) throw new BuildShapeError("The build declares no command.")
  assertExtraFiles(build.files, ["dist"])
  for (const [command, source] of commands) {
    if (!COMMAND.test(command)) {
      throw new BuildShapeError(`The command "${command}" is not a kebab-case name.`)
    }
    if (!source.startsWith("src/")) {
      throw new BuildShapeError(`The command "${command}" runs ${source}, which is outside src.`)
    }
  }
}

/** The package `bin` map for a build: each command at its built file. */
export function renderBin(build: CliBuild): Record<string, string> {
  return Object.fromEntries(
    Object.keys(build.bin).map((command) => [command, `./dist/${command}.js`]),
  )
}

/**
 * The build shape for a published command-line package: ESM for Node, one file per command, with
 * source maps so a stack trace points at `src`. A command is not an importable surface, so it emits
 * no declarations.
 */
export function cliPreset(build: CliBuild): UserConfig {
  assertCliBuild(build)
  return {
    entry: { ...build.bin },
    format: ["esm"],
    platform: "node",
    fixedExtension: false,
    sourcemap: true,
    dts: false,
    clean: true,
    outDir: "dist",
  }
}
