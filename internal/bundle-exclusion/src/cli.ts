#!/usr/bin/env -S bun --conditions=@plainworks/source
import { readdirSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
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
    isAbsolute,
    relative,
    readText: (path) => readFileSync(path, "utf8"),
    listArtifactFiles: walk,
  },
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
