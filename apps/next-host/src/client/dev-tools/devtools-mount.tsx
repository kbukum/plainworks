"use client"

import type { DevtoolsLauncher } from "@plainworks/devtools/launch"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useEffect } from "react"
import { useLiveChannel } from "../live-stream"

/** Props for {@link DevtoolsMount}. */
export interface DevtoolsMountProps {
  /** The launcher whose seams already wrap the HTTP client and the channel options. */
  readonly launcher: DevtoolsLauncher
}

/**
 * Mount the inspector over the live query client and channel read from context, and tear it down
 * on unmount. The host renders this only behind its `process.env.NODE_ENV` gate, so a production
 * build drops it. The launcher loads the shell lazily and reports any failure.
 */
export function DevtoolsMount({ launcher }: DevtoolsMountProps): ReactElement | null {
  const queryClient = useQueryClient()
  const channel = useLiveChannel()

  useEffect(
    () =>
      launcher.mount({
        load: () => import("./inspector").then(({ mountDevtools }) => mountDevtools),
        query: { client: queryClient, instance: "app", label: "App cache" },
        channel,
      }),
    [launcher, queryClient, channel],
  )

  return null
}
