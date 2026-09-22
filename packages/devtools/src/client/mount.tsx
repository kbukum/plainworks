"use client"

import { createRoot } from "react-dom/client"
import { DevtoolsShell, type DevtoolsShellProps } from "./shell/devtools-shell"

/** Options for {@link mountDevtools}. */
export interface MountDevtoolsOptions extends DevtoolsShellProps {
  /** Where the inspector root is appended; defaults to `document.body`. */
  readonly container?: HTMLElement
}

/**
 * Mount the embedded inspector in an isolated React root after the host app has hydrated, and
 * return its teardown (unmount + container removal). This performs no work at import time and
 * infers nothing about the environment — the host calls it only inside its own build-time
 * development gate, e.g. `if (import.meta.env.DEV) void import("@plainworks/devtools/client")`.
 *
 * The diagnostics rail and launcher are fixed at the viewport bottom. While active, the rail
 * automatically reserves its own bottom space so it never covers focused application controls.
 */
export function mountDevtools({ container, ...shellProps }: MountDevtoolsOptions): () => void {
  const host = document.createElement("div")
  host.dataset.plainworksDevtools = ""
  ;(container ?? document.body).append(host)
  const root = createRoot(host)
  root.render(<DevtoolsShell {...shellProps} />)
  return () => {
    root.unmount()
    host.remove()
  }
}
