import { type ChannelInstrumentation, createChannelSource } from "@plainworks/devtools/channel"
import { createHttpSource, type HttpInstrumentation } from "@plainworks/devtools/http"

/**
 * The build-time instrumentation seams the host applies to its runtime before it is constructed:
 * the HTTP interceptor wraps the client, and the channel instrumentation both decorates the
 * channel options and observes the live connection. Creating them touches nothing — they are inert
 * until the sources are registered and the runtime is instrumented.
 */
export interface DevtoolsSeams {
  readonly http: HttpInstrumentation
  readonly channel: ChannelInstrumentation
}

/**
 * Build the next-host instrumentation seams. This module holds **no import-time side effects** (no
 * CSS, no DOM), so the host reaches it through a `process.env.NODE_ENV` gate and the production
 * bundler tree-shakes the whole graph out — the statically eliminable development gate the kit
 * relies on everywhere.
 */
export function createDevtoolsSeams(): DevtoolsSeams {
  return {
    http: createHttpSource({ instance: "api", label: "Demo API" }),
    channel: createChannelSource({ instance: "live", label: "Live tasks" }),
  }
}
