#!/usr/bin/env -S bun --conditions=@plainworks/source
import { resolve } from "node:path"
import { nodeWorkspaceFiles } from "@plainworks/workspace"
import { runReleaseCommand } from "./command"
import { bunPackTools } from "./pack/bun-tools"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")

process.exitCode = await runReleaseCommand(
  process.argv.slice(2),
  { files: nodeWorkspaceFiles(repoRoot), pack: bunPackTools() },
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
