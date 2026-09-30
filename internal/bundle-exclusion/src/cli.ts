#!/usr/bin/env -S bun --conditions=@plainworks/source
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { runBundleExclusion } from "./command"
import { isArtifact } from "./scan"

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.isFile() && isArtifact(path) ? [path] : []
  })
}

process.exitCode = runBundleExclusion(
  process.argv.slice(2),
  {
    cwd: () => process.cwd(),
    resolve,
    dirname,
    join,
    relative,
    exists: existsSync,
    realpath: realpathSync,
    readText: (path) => readFileSync(path, "utf8"),
    listArtifactFiles: walk,
  },
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
