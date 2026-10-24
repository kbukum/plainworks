import { createHash } from "node:crypto"
import type { Finding } from "../../checks/findings"
import { FlowError } from "../errors"
import type { JourneyMetrics } from "./budget"

/** A field as a journey's user knows it: its accessible name on a page path. */
export interface TypedField {
  readonly path: string
  readonly name: string
}

/** The metrics a `FlowUser` verb adds one to. */
export type CountedVerb = "typedFields" | "picks" | "activations"

/**
 * The running tally of one flow on one device. The page session feeds it page changes, and the
 * flow's `FlowUser` feeds it each verb. In a `strict` journey (a flow with a budget), a visit is
 * only allowed as the first step, since every later page must be reached through the UI.
 */
export interface JourneyMeter {
  /** Begin counting from the page the journey starts on. Later calls do nothing. */
  start(url: string): void
  /** A main-frame navigation; counts a view when the path changed. */
  view(url: string): void
  /** A visit is about to navigate: it becomes the journey's start. */
  beginVisit(): void
  record(verb: CountedVerb): void
  moveFocus(count: number): void
  /** A value typed into a field; a repeat into another field is a `redundant-entry` finding. */
  typed(field: TypedField, value: string): void
  /** A finding about how the user got through the page. */
  report(finding: Finding): void
  drainFindings(): Finding[]
  metrics(): JourneyMetrics
}

// A value this short repeats by chance ("1", "ok", "yes"), so it says nothing about redundancy.
const MIN_REDUNDANT_CHARS = 3

/** A fresh meter for one flow on one device. */
export function createJourneyMeter(options: { readonly strict: boolean }): JourneyMeter {
  let started = false
  let acted = false
  let path: string | undefined
  const counts = { views: 0, typedFields: 0, picks: 0, activations: 0, focusMoves: 0 }
  // Typed values are kept only as digests, in memory, so no value reaches a report or a log.
  const typedInto = new Map<string, TypedField>()
  const findings: Finding[] = []

  const show = (url: string): void => {
    const next = pathOf(url)
    if (next === undefined || next === path) return
    path = next
    counts.views++
  }

  return {
    start(url) {
      if (started) return
      started = true
      show(url)
    },
    view(url) {
      if (started) show(url)
    },
    beginVisit() {
      if (acted && options.strict) {
        throw new FlowError(
          "definition",
          "user.visit is only allowed as the first step of a journey; reach later pages through the UI",
        )
      }
      started = true
      if (!acted) {
        path = undefined
        counts.views = 0
      }
      acted = true
    },
    record(verb) {
      acted = true
      counts[verb]++
    },
    moveFocus(count) {
      counts.focusMoves += count
    },
    typed(field, value) {
      const normalized = value.trim().toLowerCase()
      if (normalized.length < MIN_REDUNDANT_CHARS) return
      const digest = createHash("sha256").update(normalized).digest("hex")
      const first = typedInto.get(digest)
      if (first === undefined) {
        typedInto.set(digest, field)
        return
      }
      if (first.path === field.path && first.name === field.name) return
      findings.push({
        check: "redundant-entry",
        message: `"${field.name}" repeats a value already typed into "${first.name}" on ${first.path}`,
      })
    },
    report(finding) {
      findings.push(finding)
    },
    drainFindings: () => findings.splice(0),
    metrics: () => ({ ...counts }),
  }
}

function pathOf(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined
  const parsed = new URL(url)
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.pathname : undefined
}
