#!/usr/bin/env -S bun --conditions=@plainworks/source
import { resolve } from "node:path"
import { nodeWorkspaceFiles } from "@plainworks/workspace"
import { runShapeCommand } from "./command"
import { moduleConfigLoader } from "./config-loader"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")

process.exitCode = await runShapeCommand(
  process.argv.slice(2),
  { files: nodeWorkspaceFiles(repoRoot), configs: moduleConfigLoader(repoRoot) },
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
