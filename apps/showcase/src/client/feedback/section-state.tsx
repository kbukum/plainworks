"use client"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plainworks/elements/empty"
import { Callout, LoadingState } from "@plainworks/ui/feedback"
import type { ReactElement, ReactNode } from "react"

/** The empty-state copy a section shows when a successful read returns nothing. */
export interface SectionEmpty {
  readonly title: string
  readonly body?: ReactNode
  /** Optional leading icon (an SVG element); injected, never imported here. */
  readonly icon?: ReactNode
}

interface SectionStateBaseProps {
  /** The read is in flight — show the labelled skeleton. */
  readonly pending: boolean
  /** The read failed — show the danger callout. */
  readonly error?: boolean
  /** Accessible name for the loading status region. */
  readonly loadingLabel: string
  /** Heading for the error callout. */
  readonly errorTitle: string
  /** Body copy for the error callout. */
  readonly errorBody?: ReactNode
  /** Placeholder line count while pending. Defaults to 4. */
  readonly skeletonLines?: number
  /** The resolved content, shown once the read succeeds with rows. */
  readonly children: ReactNode
}

/** Props for {@link SectionState}; empty content is required whenever `isEmpty` may be true. */
export type SectionStateProps = SectionStateBaseProps &
  (
    | {
        readonly isEmpty: boolean
        readonly empty: SectionEmpty
      }
    | {
        readonly isEmpty?: false
        readonly empty?: never
      }
  )

/**
 * The one loading/error/empty gate every section renders its body behind, so the whole app speaks
 * the same feedback language. It composes the kit's `LoadingState`, `Callout`, and `Empty` — a
 * polite `status` region while pending, a danger callout on failure, the empty state when a
 * successful read is blank, and otherwise the children.
 */
export function SectionState(props: SectionStateProps): ReactElement {
  const {
    pending,
    error = false,
    loadingLabel,
    errorTitle,
    errorBody,
    skeletonLines = 4,
    children,
  } = props
  if (pending) {
    return <LoadingState label={loadingLabel} lines={skeletonLines} />
  }
  if (error) {
    return (
      <Callout tone="danger" title={errorTitle}>
        {errorBody}
      </Callout>
    )
  }
  if (props.isEmpty) {
    const { empty } = props
    return (
      <Empty>
        <EmptyHeader>
          {empty.icon === undefined ? null : <EmptyMedia variant="icon">{empty.icon}</EmptyMedia>}
          <EmptyTitle>{empty.title}</EmptyTitle>
          {empty.body === undefined ? null : <EmptyDescription>{empty.body}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    )
  }
  return <>{children}</>
}
