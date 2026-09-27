import {
  type APIRequestContext,
  type BrowserContext,
  test as base,
  type Page,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType,
} from "@playwright/test"
import { type BrowserGateHost, startGateHost } from "./host"
import { type RuntimeErrorWatch, watchRuntimeErrors } from "./runtime-errors"

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

/**
 * Screenshot comparison defaults for the Playwright config's `expect.toHaveScreenshot`. Animations
 * and the caret are frozen, `scale: "css"` keeps one baseline per CSS pixel whatever the device
 * scale, and `threshold` absorbs per-pixel anti-aliasing. `maxDiffPixels` is a fixed count, not a
 * share of the image, and stays below one 24×24 target, so a missing control fails on any capture
 * size. A ratio would not: 1% of a mostly blank screen hides a whole row of dialog actions.
 */
export const browserGateScreenshot: {
  readonly animations: "disabled"
  readonly caret: "hide"
  readonly scale: "css"
  readonly threshold: number
  readonly maxDiffPixels: number
} = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  threshold: 0.2,
  maxDiffPixels: 100,
}

/** The fixtures the gate adds to every test. */
export interface BrowserGateFixtures {
  /** The page's runtime failures. Call `allow` for a failure the test provokes on purpose. */
  readonly runtimeErrors: RuntimeErrorWatch
}

/** A signed-in browser state, as `context.storageState()` returns it. */
export type BrowserGateStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>

/** The per-worker fixtures the gate adds. */
export interface BrowserGateWorkerFixtures {
  /** This worker's own host origin, or the configured `baseURL` when the gate starts no host. */
  readonly gateOrigin: string | undefined
  /** This worker's signed-in state, made once on first use, when the gate can sign in. */
  readonly gateSignedIn: BrowserGateStorageState | undefined
}

/** The Playwright `test` a gated suite writes its tests with. */
export type BrowserGateTest = TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & BrowserGateFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & BrowserGateWorkerFixtures
>

/** Options for {@link createBrowserGate}. */
export interface BrowserGateOptions {
  /** The instant the page reads as now. Defaults to {@link BROWSER_GATE_NOW}. */
  readonly now?: string
  /** Origins the page may reach besides the configured `baseURL`. */
  readonly allowedOrigins?: readonly string[]
  /**
   * Return the host to its seeded state before each test, for example by calling its reset
   * endpoint. Tests then pass in any order and on any shard, whatever an earlier test changed.
   */
  readonly resetHost?: (request: APIRequestContext) => Promise<void>
  /**
   * Start one host per worker, on its own port, instead of sharing one `webServer`. Workers then
   * run in parallel, because none resets a backend another worker is reading.
   */
  readonly host?: BrowserGateHost
  /**
   * Sign in once per worker. Every test then starts signed in, unless it sets its own
   * `storageState` (a signed-out test passes an empty state).
   */
  readonly signIn?: (page: Page) => Promise<void>
}

// Time for a worker to start its host and sign in: a cold dev-server compile plus the warm paths.
const WORKER_SETUP_TIMEOUT_MS = 300_000

/**
 * Build the `test` for a gated browser suite.
 *
 * Each worker can start its own host and sign in once, so workers run in parallel. Before each test
 * touches the page, the gate resets the host when asked, pins the page's `Date` to a fixed instant
 * (timers keep running, so the app still works), and starts watching for runtime errors, including
 * requests that leave the allowed origins. When the test ends, any recorded error fails it, so a
 * page that looks right but threw, failed to hydrate, or reached the network cannot pass.
 */
export function createBrowserGate(options: BrowserGateOptions = {}): BrowserGateTest {
  const now = options.now ?? BROWSER_GATE_NOW
  return base.extend<BrowserGateFixtures, BrowserGateWorkerFixtures>({
    gateOrigin: [
      // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from its destructured first argument, and this one has none.
      async ({}, use, workerInfo) => {
        const host = options.host
        if (host === undefined) {
          await use(workerInfo.project.use.baseURL)
          return
        }
        const running = await startGateHost(host, host.basePort + workerInfo.parallelIndex)
        try {
          await use(running.origin)
        } finally {
          await running.stop()
        }
      },
      { scope: "worker", timeout: WORKER_SETUP_TIMEOUT_MS },
    ],
    gateSignedIn: [
      async ({ browser, gateOrigin }, use) => {
        const signIn = options.signIn
        if (signIn === undefined) {
          await use(undefined)
          return
        }
        const context = await browser.newContext({
          ...browserGateUse,
          ...(gateOrigin === undefined ? {} : { baseURL: gateOrigin }),
        })
        try {
          await signIn(await context.newPage())
          await use(await context.storageState())
        } finally {
          await context.close()
        }
      },
      { scope: "worker", timeout: WORKER_SETUP_TIMEOUT_MS },
    ],
    baseURL: async ({ baseURL, gateOrigin }, use) => {
      await use(gateOrigin ?? baseURL)
    },
    storageState: async ({ storageState, gateSignedIn }, use) => {
      await use(storageState ?? gateSignedIn)
    },
    runtimeErrors: [
      async ({ page, baseURL, request }, use) => {
        await options.resetHost?.(request)
        await page.clock.setFixedTime(now)
        const allowedOrigins = [
          ...(baseURL === undefined ? [] : [baseURL]),
          ...(options.allowedOrigins ?? []),
        ]
        const watch = await watchRuntimeErrors(page, { allowedOrigins })
        await use(watch)
        watch.expectNone()
      },
      { auto: true },
    ],
  })
}
