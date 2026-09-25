"use client"

import { useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useEffect } from "react"
import { useLiveChannel } from "../live-stream"
import type { DevtoolsSeams } from "./seams"

/** Props for {@link DevtoolsMount}. */
export interface DevtoolsMountProps {
  /** The development instrumentation seams already woven into the HTTP client and channel. */
  readonly seams: DevtoolsSeams
}

/**
 * Mount the inspector against the live query client and channel read from context. The host
 * renders this only behind its `process.env.NODE_ENV` gate, so a production build drops the
 * component; the shell and its CSS load lazily from here. A load or mount failure is reported and
 * leaves the app running. The mount is torn down on unmount.
 */
export function DevtoolsMount({ seams }: DevtoolsMountProps): ReactElement | null {
  const queryClient = useQueryClient()
  const channel = useLiveChannel()

  useEffect(() => {
    let teardown: (() => void) | undefined
    let active = true
    import("./mount")
      .then(({ mountNextHostDevtools }) => {
        if (active) teardown = mountNextHostDevtools({ seams, queryClient, channel })
      })
      .catch((error: unknown) => {
        console.error("Development inspector failed to mount.", error)
      })
    return () => {
      active = false
      teardown?.()
    }
  }, [seams, queryClient, channel])

  return null
}
