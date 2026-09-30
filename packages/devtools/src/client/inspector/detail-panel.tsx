"use client"

import type { Json } from "@plainworks/std/encoding"
import { Callout } from "@plainworks/ui/feedback/callout"
import { Spinner } from "@plainworks/ui/feedback/spinner"
import { type ReactElement, useEffect, useState } from "react"
import type { SourceId } from "../../protocol"
import type { DevtoolsClientPort, RequestError } from "../../session"
import { useDevtoolsLabels } from "../labels"
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
  | { readonly status: "failed"; readonly error: string | undefined }
  | { readonly status: "loaded"; readonly value: Json }
  | { readonly status: "superseded" }

/**
 * On-demand detail for one selected timeline item. Fetching starts on selection and is cancelled
 * on reselection or unmount; a superseded or cancelled request settles quietly. Custom source
 * panels compose this instead of re-implementing request lifecycle.
 */
export function DetailPanel({ port, source, detailRef }: DetailPanelProps): ReactElement | null {
  const labels = useDevtoolsLabels()
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
        <Spinner label={labels.loadingDetail} size="sm" />
      </div>
    )
  }
  if (state.status === "failed") {
    return <Callout tone="danger">{state.error ?? labels.detailFailed}</Callout>
  }
  return <JsonTree value={state.value} />
}

function isSuperseded(error: RequestError): boolean {
  return error.kind === "devtools/request-superseded" || error.kind === "devtools/request-cancelled"
}

function errorText(error: RequestError): string | undefined {
  const cause = error.cause
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message
  }
  return undefined
}
