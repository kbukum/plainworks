import type { Channel } from "@plainworks/channel"
import {
  type ChannelInstrumentation,
  type ChannelSourceOptions,
  createChannelSource,
} from "../adapters/channel/channel-source"
import {
  createHttpSource,
  type HttpInstrumentation,
  type HttpSourceOptions,
} from "../adapters/http/http-source"
import { createQuerySource, type QuerySourceOptions } from "../adapters/query/query-source"
import type { Source } from "../source"

/**
 * Renders the inspector over `sources` and returns its disposal. `mountDevtools` from
 * `@plainworks/devtools/client` fits as is; a host wraps it to add its own renderers.
 */
export type DevtoolsInspector = (options: { readonly sources: readonly Source[] }) => {
  dispose(): void
}

/** Receives every inspector failure. The inspector is optional, so a failure never throws. */
export type DevtoolsReport = (message: string, error: unknown) => void

/** Options for {@link launchDevtools}. */
export interface LaunchDevtoolsOptions {
  /** Where startup, load, and mount failures go — typically `console.error`. */
  readonly report: DevtoolsReport
  /** Observe an `@plainworks/http` client. The host wraps the client in `launcher.http.interceptor`. */
  readonly http?: HttpSourceOptions
  /** Observe an `@plainworks/channel`. The host passes its options through `launcher.channel.instrument`. */
  readonly channel?: ChannelSourceOptions
}

/** Options for {@link DevtoolsLauncher.mount}. */
export interface DevtoolsLaunchMountOptions {
  /**
   * Load the inspector — the host's dynamic import of the DOM side (shell and styles), so the
   * inspector stays out of the startup chunk.
   */
  readonly load: () => Promise<DevtoolsInspector>
  /** Observe a query client that exists only once the app is built. */
  readonly query?: QuerySourceOptions
  /** The live channel built from the instrumented options; its frames are observed. */
  readonly channel?: Channel
  /** Extra app-owned sources, listed after the built-in ones. */
  readonly sources?: readonly Source[]
}

/** The startup seams plus the deferred mount, returned by {@link launchDevtools}. */
export interface DevtoolsLauncher {
  /** Present when `http` was requested and startup succeeded. */
  readonly http: HttpInstrumentation | undefined
  /** Present when `channel` was requested and startup succeeded. */
  readonly channel: ChannelInstrumentation | undefined
  /**
   * Load and mount the inspector over the live runtime; return teardown. A load or mount failure
   * is reported and releases everything observed. Teardown before the load settles cancels the
   * mount. Teardown is idempotent.
   */
  mount(options: DevtoolsLaunchMountOptions): () => void
}

const inert: DevtoolsLauncher = { http: undefined, channel: undefined, mount: () => () => {} }

/**
 * Start the development inspector in two phases. At startup, build the HTTP and channel seams the
 * runtime is constructed with. Once the app runs, `mount` loads the inspector and observes the live
 * runtime. This module touches no DOM and loads no styles, so the host can import it before
 * hydration. The host still owns the build-time development gate around both phases. A startup
 * failure is reported and returns an inert launcher, so the app runs uninstrumented.
 */
export function launchDevtools(options: LaunchDevtoolsOptions): DevtoolsLauncher {
  const { report } = options
  let http: HttpInstrumentation | undefined
  let channel: ChannelInstrumentation | undefined
  try {
    http = options.http === undefined ? undefined : createHttpSource(options.http)
    channel = options.channel === undefined ? undefined : createChannelSource(options.channel)
  } catch (error) {
    report("Development inspector failed to start; continuing without it.", error)
    return inert
  }

  function mount({
    load,
    query,
    channel: live,
    sources = [],
  }: DevtoolsLaunchMountOptions): () => void {
    let active = true
    let dispose: (() => void) | undefined
    const observation = live === undefined ? undefined : channel?.observe(live)

    function release(): void {
      active = false
      observation?.unsubscribe()
    }

    // Defer the loader so a synchronous throw lands in the same catch as a rejection.
    Promise.resolve()
      .then(load)
      .then((inspector) => {
        if (!active) return
        const all: Source[] = []
        if (http !== undefined) all.push(http.source)
        if (channel !== undefined) all.push(channel.source)
        if (query !== undefined) all.push(createQuerySource(query))
        all.push(...sources)
        const instance = inspector({ sources: all })
        dispose = () => instance.dispose()
      })
      .catch((error: unknown) => {
        release()
        report("Development inspector failed to mount.", error)
      })

    return () => {
      if (!active && dispose === undefined) return
      release()
      const current = dispose
      dispose = undefined
      current?.()
    }
  }

  return { http, channel, mount }
}
