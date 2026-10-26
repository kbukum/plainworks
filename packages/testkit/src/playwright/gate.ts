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
 * the shared host {@link setupSharedGateHost} starts, the warm host `ui:capture` reuses, or a base
 * commit's host. No worker then starts its own. Without a {@link BrowserGateOptions.dataScope},
 * run a single worker against it, since each test resets that one backend.
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
  /** This test's data scope id, or `undefined` when the gate has no `dataScope`. */
  readonly gateScope: string | undefined
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
  /**
   * Give each test its own data on a shared host, so many workers can share one host. With a
   * `header`, the gate sends a fresh scope id in it on every request the test's browser context and
   * `request` fixture make, and the host keeps each test's data apart. Without one, the suite keeps
   * it apart itself, for example with a fresh tenant per test. After the test, `release` (when set)
   * tells the host to drop that data; a failed release fails the test.
   */
  readonly dataScope?: BrowserGateDataScope
}

/** How a gate keeps each test's data apart on a shared host. See {@link BrowserGateOptions}. */
export interface BrowserGateDataScope {
  /**
   * The request header that names the scope, such as `@plainworks/mocks/scope`'s header. Omit it
   * when the tests themselves keep their data apart on the host; the gate then sends no header.
   */
  readonly header?: string
  /** Drop the scope's data on the host. Its requests carry the scope header, when there is one. */
  readonly release?: (request: APIRequestContext) => Promise<void>
}

// Time for a worker to start its host and sign in: a cold dev-server compile plus the warm paths.
const WORKER_SETUP_TIMEOUT_MS = 300_000

/**
 * Build the `test` for a gated browser suite.
 *
 * Each worker can start its own host, so workers run in parallel; with {@link GATE_ORIGIN_ENV}
 * set, every worker uses that running host instead, and a `dataScope` keeps their data apart.
 * Before each test
 * touches the page, the gate resets the host when asked, pins the page's `Date` to a fixed instant
 * (timers keep running, so the app still works), and starts watching for runtime errors, including
 * requests that leave the allowed origins. When the test ends, any recorded error fails it, so a
 * page that looks right but threw, failed to hydrate, or reached the network cannot pass.
 */
export function createBrowserGate(options: BrowserGateOptions = {}): BrowserGateTest {
  const now = options.now === undefined ? BROWSER_GATE_NOW : options.now
  const scoped = options.dataScope
  return base.extend<BrowserGateFixtures, BrowserGateWorkerFixtures>({
    gateSignIn: [options.signIn !== undefined, { option: true }],
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from its destructured first argument, and this one has none.
    gateScope: async ({}, use) => {
      await use(scoped === undefined ? undefined : crypto.randomUUID())
    },
    extraHTTPHeaders: async ({ extraHTTPHeaders, gateScope }, use) => {
      await use(
        scoped?.header === undefined || gateScope === undefined
          ? extraHTTPHeaders
          : { ...extraHTTPHeaders, [scoped.header]: gateScope },
      )
    },
    gateHost: [
      // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from its destructured first argument, and this one has none.
      async ({}, use, workerInfo) => {
        const running = process.env[GATE_ORIGIN_ENV]
        if (running !== undefined && running !== "") {
          if (scoped === undefined && workerInfo.config.workers !== 1) {
            throw new Error(
              "An external/warm gate host requires exactly one worker, or a gate dataScope.",
            )
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
        const failures: unknown[] = []
        // The scope is released even when setup fails, so a failed test never holds host data.
        try {
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
        } catch (error) {
          failures.push(error)
        }
        try {
          await scoped?.release?.(request)
        } catch (error) {
          failures.push(
            new Error("The gate could not release this test's data scope.", { cause: error }),
          )
        }
        if (failures.length === 1) throw failures[0]
        if (failures.length > 1) throw new AggregateError(failures, "The gated test failed twice.")
      },
      { auto: true },
    ],
  })
}

/**
 * Start one host for the whole run from a Playwright `globalSetup`, and point every worker at it
 * through {@link GATE_ORIGIN_ENV}. Pair it with a gate `dataScope` so workers can share the host.
 * When {@link GATE_ORIGIN_ENV} is already set, the run reuses that host and nothing starts. Returns
 * the teardown Playwright runs after the run; it stops the host.
 */
export async function setupSharedGateHost(host: BrowserGateHost): Promise<() => Promise<void>> {
  const running = process.env[GATE_ORIGIN_ENV]
  if (running !== undefined && running !== "") return async () => {}
  const started = await startGateHost(host, host.basePort)
  process.env[GATE_ORIGIN_ENV] = started.origin
  return async () => {
    delete process.env[GATE_ORIGIN_ENV]
    await started.stop()
  }
}
