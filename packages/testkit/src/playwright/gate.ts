import {
  type APIRequestContext,
  test as base,
  type Page,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType,
} from "@playwright/test"
import { type RuntimeErrorWatch, watchRuntimeErrors } from "./checks/runtime-errors"
import { type BrowserGateHost, type RunningGateHost, startGateHost } from "./host"

/**
 * The instant every gated page and host reads as "now": a fixed midday UTC, so a date never flips
 * between machines or between a capture and its baseline.
 */
export const BROWSER_GATE_NOW = "2026-01-15T12:00:00.000Z"

/**
 * The environment variable a reference host reads to pin its own clock (ISO-8601 instant). Pass
 * `{ [FIXED_NOW_ENV]: BROWSER_GATE_NOW }` to the Playwright `webServer.env` so server-rendered and
 * browser-rendered times agree.
 */
export const FIXED_NOW_ENV = "PLAINWORKS_FIXED_NOW"

/**
 * The environment variable that points every worker at a host that is already running, such as
 * the warm host `ui:capture` reuses or a base commit's host. No worker then starts its own. Run a
 * single worker against it, since each test resets that one backend.
 */
export const GATE_ORIGIN_ENV = "PLAINWORKS_GATE_ORIGIN"

/**
 * Browser context options for a deterministic run: a fixed locale and time zone, light mode by
 * default, reduced motion, and no service workers (which could serve a response the gate did not
 * see). Spread it into the Playwright config's `use`.
 */
export const browserGateUse: {
  readonly locale: string
  readonly timezoneId: string
  readonly colorScheme: "light"
  readonly reducedMotion: "reduce"
  readonly serviceWorkers: "block"
} = {
  locale: "en-US",
  timezoneId: "UTC",
  colorScheme: "light",
  reducedMotion: "reduce",
  serviceWorkers: "block",
}

/** The fixtures the gate adds to every test. */
export interface BrowserGateFixtures {
  /** Establish a fresh session after reset. Set false for a signed-out journey. */
  readonly gateSignIn: boolean
  /** The page's runtime failures. Call `allow` for a failure the test provokes on purpose. */
  readonly runtimeErrors: RuntimeErrorWatch
}

/** The per-worker fixtures the gate adds. */
export interface BrowserGateWorkerFixtures {
  /** This worker's own host origin, or the configured `baseURL` when the gate starts no host. */
  readonly gateOrigin: string | undefined
  /** This worker's owned process lifecycle; absent for an explicitly external host. */
  readonly gateHost: RunningGateHost | undefined
}

/** The Playwright `test` a gated suite writes its tests with. */
export type BrowserGateTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & BrowserGateFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & BrowserGateWorkerFixtures
>

/** Options for {@link createBrowserGate}. */
export interface BrowserGateOptions {
  /** The instant the page reads as now. Defaults to {@link BROWSER_GATE_NOW}; `null` keeps the real
   * clock, required when a journey runs against a host whose own clock advances in real time. */
  readonly now?: string | null
  /** Origins the page may reach besides the configured `baseURL`. */
  readonly allowedOrigins?: readonly string[]
  /**
   * Return the host to its seeded state before each test, for example by calling its reset
   * endpoint. Tests then pass in any order and on any worker, whatever an earlier test changed.
   */
  readonly resetHost?: (request: APIRequestContext) => Promise<void>
  /**
   * Start one host per worker, on its own port, instead of sharing one `webServer`. Workers then
   * run in parallel, because none resets a backend another worker is reading.
   */
  readonly host?: BrowserGateHost
  /**
   * Sign in after reset for each test, in that test's fresh browser context. A signed-out test
   * sets `gateSignIn: false`; credential-bearing storage states are never reused.
   */
  readonly signIn?: (page: Page) => Promise<void>
}

// Time for a worker to start its host and sign in: a cold dev-server compile plus the warm paths.
const WORKER_SETUP_TIMEOUT_MS = 300_000

/**
 * Build the `test` for a gated browser suite.
 *
 * Each worker can start its own host, so workers run in parallel; with
 * {@link GATE_ORIGIN_ENV} set, every worker uses that running host instead. Before each test
 * touches the page, the gate resets the host when asked, pins the page's `Date` to a fixed instant
 * (timers keep running, so the app still works), and starts watching for runtime errors, including
 * requests that leave the allowed origins. When the test ends, any recorded error fails it, so a
 * page that looks right but threw, failed to hydrate, or reached the network cannot pass.
 */
export function createBrowserGate(options: BrowserGateOptions = {}): BrowserGateTest {
  const now = options.now === undefined ? BROWSER_GATE_NOW : options.now
  return base.extend<BrowserGateFixtures, BrowserGateWorkerFixtures>({
    gateSignIn: [options.signIn !== undefined, { option: true }],
    gateHost: [
      // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from its destructured first argument, and this one has none.
      async ({}, use, workerInfo) => {
        const running = process.env[GATE_ORIGIN_ENV]
        if (running !== undefined && running !== "") {
          if (workerInfo.config.workers !== 1) {
            throw new Error("An external/warm gate host requires exactly one worker.")
          }
          await use(undefined)
          return
        }
        const host = options.host
        if (host === undefined) {
          await use(undefined)
          return
        }
        const started = await startGateHost(host, host.basePort + workerInfo.parallelIndex)
        try {
          await use(started)
        } finally {
          await started.stop()
        }
      },
      { scope: "worker", timeout: WORKER_SETUP_TIMEOUT_MS },
    ],
    gateOrigin: [
      async ({ gateHost }, use, workerInfo) => {
        await use(
          gateHost?.origin || process.env[GATE_ORIGIN_ENV] || workerInfo.project.use.baseURL,
        )
      },
      { scope: "worker", timeout: WORKER_SETUP_TIMEOUT_MS },
    ],
    baseURL: async ({ baseURL, gateOrigin }, use) => {
      await use(gateOrigin ?? baseURL)
    },
    runtimeErrors: [
      async ({ page, baseURL, request, gateSignIn, storageState }, use) => {
        if (options.signIn !== undefined && storageState !== undefined) {
          throw new Error("Session flows must sign in after reset, not reuse storageState.")
        }
        await options.resetHost?.(request)
        if (now !== null) await page.clock.setFixedTime(now)
        const allowedOrigins = [
          ...(baseURL === undefined ? [] : [baseURL]),
          ...(options.allowedOrigins ?? []),
        ]
        const watch = await watchRuntimeErrors(page, { allowedOrigins })
        if (gateSignIn) await options.signIn?.(page)
        await use(watch)
        watch.expectNone()
      },
      { auto: true },
    ],
  })
}
