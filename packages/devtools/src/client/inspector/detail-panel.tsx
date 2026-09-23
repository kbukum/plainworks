"use client"

import { Spinner } from "@plainworks/ui/feedback"
import { type ReactElement, useEffect, useState } from "react"
import type { Json } from "../../privacy"
import type { SourceId } from "../../protocol"
import type { DevtoolsClientPort, RequestError } from "../../session"
import { JsonTree } from "./json-tree"

/** Props for {@link DetailPanel}. */
export interface DetailPanelProps {
  /** The client port detail requests flow through. */
  readonly port: DevtoolsClientPort
  /** Source that owns the detail. */
  readonly source: SourceId
  /** The event's opaque detail token, echoed back unchanged. */
  readonly detailRef: string
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "loaded"; readonly value: Json }
  | { readonly status: "superseded" }

/**
 * On-demand detail for one selected timeline item. Fetching starts on selection and is cancelled
 * on reselection or unmount; a superseded or cancelled request settles quietly. Custom source
 * panels compose this instead of re-implementing request lifecycle.
 */
export function DetailPanel({ port, source, detailRef }: DetailPanelProps): ReactElement | null {
  const [state, setState] = useState<LoadState>({ status: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    void port.requestDetail(source, detailRef, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setState({ status: "loaded", value: result.value.value })
        return
      }
      if (isSuperseded(result.error)) {
        setState({ status: "superseded" })
        return
      }
      setState({ status: "failed", error: errorText(result.error) })
    })
    return () => controller.abort()
  }, [port, source, detailRef])

  if (state.status === "superseded") return null
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
        <Spinner label="Loading detail" size="sm" />
      </div>
    )
  }
  if (state.status === "failed") {
    return (
      <p role="alert" className="py-2 text-destructive text-xs">
        {state.error}
      </p>
    )
  }
  return <JsonTree value={state.value} />
}

function isSuperseded(error: RequestError): boolean {
  return error.kind === "devtools/request-superseded" || error.kind === "devtools/request-cancelled"
}

function errorText(error: RequestError): string {
  const cause = error.cause
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message
  }
  return "The detail could not be loaded."
}
