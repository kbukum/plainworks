import { createHttpSource, type HttpInstrumentation } from "@plainworks/devtools/http"

/**
 * The instrumentation the showcase applies before its runtime is built: the HTTP interceptor must
 * wrap the client at construction. Creating it touches nothing — it stays inert until its source is
 * registered by the mount.
 */
export interface ShowcaseDevtoolsSeams {
  readonly http: HttpInstrumentation
}

/**
 * Build the showcase instrumentation seams. This module has **no import-time side effects** (no
 * CSS, no DOM, no shell), so the host can load it before hydration inside its development gate and
 * load the DOM-side `mountShowcaseDevtools` only after the app is interactive.
 */
export function createShowcaseDevtoolsSeams(): ShowcaseDevtoolsSeams {
  return { http: createHttpSource({ instance: "api", label: "Demo API" }) }
}
