import {
  GATE_ORIGIN_ENV,
  runOwnedCommand,
  setupSharedGateHost,
} from "@plainworks/testkit/playwright"
import { APP_DIR, GATE_BUILD_DIR, SHOWCASE_GATE_HOST } from "./host"

// Both builds together take seconds; the budget only bounds a hung bundler.
const BUILD_TIMEOUT_MS = 180_000

async function build(args: readonly string[], signal: AbortSignal): Promise<void> {
  const { code, output } = await runOwnedCommand(
    `${APP_DIR}node_modules/.bin/vite`,
    ["build", "-c", "vite.gate.config.ts", "--logLevel", "warn", ...args],
    // Development React keeps hydration warnings and the devtools inspector the gate proves.
    { signal, cwd: APP_DIR, env: { NODE_ENV: "development", SHOWCASE_BUILD_DIR: GATE_BUILD_DIR } },
  )
  if (code !== 0)
    throw new Error(`The gate build failed (${args.join(" ") || "client"}).\n${output}`)
}

// Playwright's `globalSetup`: build the app once, then start the one host every worker shares.
// A run pointed at an already running host (`ui:capture`) builds and starts nothing.
export default async function globalSetup(): Promise<() => Promise<void>> {
  const running = process.env[GATE_ORIGIN_ENV]
  if (running !== undefined && running !== "") return async () => {}
  const signal = AbortSignal.timeout(BUILD_TIMEOUT_MS)
  await build([], signal)
  await build(["--ssr", "src/entry-server.tsx"], signal)
  return setupSharedGateHost(SHOWCASE_GATE_HOST)
}
