import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { setupFlowRun } from "@plainworks/testkit/playwright"
import { initAuthFixture } from "./auth-host"
import { privateFile } from "./paths"

/**
 * Build the browser consumer from the published `@plainworks/*` exports and create the private auth
 * fixture, both inside the disposable container's private tmpfs. The built assets and fixture are
 * ephemeral run state, never retained artifacts.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const assets = privateFile("assets")
  mkdirSync(assets, { recursive: true, mode: 0o700 })
  const main = fileURLToPath(new URL("consumer/main.ts", import.meta.url))
  const index = fileURLToPath(new URL("consumer/index.html", import.meta.url))
  execFileSync(
    "bun",
    ["build", main, "--target", "browser", "--outfile", join(assets, "main.js")],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 },
  )
  copyFileSync(index, join(assets, "index.html"))
  initAuthFixture()
  return setupFlowRun({ root: ".ui-artifacts/proof/auth-capture" })
}
