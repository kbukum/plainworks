#!/usr/bin/env bun
// Regenerate one app's Linux screenshot baselines inside the Playwright image CI runs:
//
//   bun internal/visual-baselines/src/cli.ts <app> [playwright args]
//
// Delete an app's `linux` baseline folders first to regenerate every baseline from scratch.

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { containerScript, dockerRunArgs, parseBaselineArgs } from "./command"
import { VISUAL_APPS } from "./config"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")
const request = parseBaselineArgs(process.argv.slice(2), VISUAL_APPS)
if ("usage" in request) {
  process.stderr.write(`${request.usage}\n`)
  process.exit(2)
}

const manifest: unknown = JSON.parse(
  readFileSync(resolve(repoRoot, "apps", request.app, "package.json"), "utf8"),
)
const packageName =
  typeof manifest === "object" && manifest !== null && "name" in manifest
    ? manifest.name
    : undefined
if (typeof packageName !== "string") {
  throw new TypeError(`apps/${request.app}/package.json has no name`)
}

const script = containerScript({
  app: request.app,
  packageName,
  owner: `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
})
const result = spawnSync(
  "docker",
  dockerRunArgs({
    repoRoot,
    script,
    playwrightArgs: request.playwrightArgs,
    platform: process.env.E2E_LINUX_PLATFORM,
  }),
  { stdio: "inherit" },
)
if (result.error !== undefined) throw result.error
process.exit(result.status ?? 1)
