import type { ErrorSnapshot } from "@plainworks/std"
import { type Severity, type SourceDescriptor, type SourceId, sourceKey } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"

/**
 * One row of the diagnostics rail: either a source indicator or a synthesized failure signal,
 * already prioritized for display. The rail renders exactly what it is given — all derivation
 * (severity order, staleness, failure mapping) happens here so it is unit-testable without a DOM.
 */
export interface RailEntry {
  /** Stable key for React lists. */
  readonly key: string
  /** Source the entry belongs to. */
  readonly source: SourceId
  /** Accessible label (indicator label, or the source label for failures). */
  readonly label: string
  /** Concise value (`"3 stale"`, `"Failed"`). */
  readonly value: string
  /** Severity driving color and sort order. */
  readonly severity: Severity
  /** Whether the value is older than the freshness window. */
  readonly stale: boolean
  /** Inspector view activated by the entry, when the source advertised one. */
  readonly target?: string
}

/** Inputs for {@link buildRailEntries}: the session slices the rail is a view over. */
export interface RailInput {
  readonly sources: readonly SourceDescriptor[]
  readonly failures: ReadonlyMap<string, ErrorSnapshot>
  readonly indicators: readonly IndicatorEntry[]
  /** Host-reported aggregate dropped-event count; above zero it becomes a warning entry. */
  readonly droppedAggregate: number
  /** Current clock reading, injected for deterministic staleness. */
  readonly now: number
  /** Age in milliseconds after which an indicator is stale. */
  readonly staleAfterMs: number
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  ok: 3,
}

/**
 * Derive the prioritized rail rows from session state. Failures become error entries ahead of
 * every indicator (a broken adapter matters more than any value); indicators sort by severity,
 * then freshness. Staleness is a flag, never a removal — an old value stays visible but faded.
 */
export function buildRailEntries(input: RailInput): readonly RailEntry[] {
  const failureEntries: RailEntry[] = []
  for (const key of input.failures.keys()) {
    const source = input.sources.find((candidate) => sourceKey(candidate.id) === key)
    if (!source) continue
    failureEntries.push({
      key: `failure:${key}`,
      source: source.id,
      label: source.label,
      value: "Failed",
      severity: "error",
      stale: false,
      target: source.id.kind,
    })
  }
  failureEntries.sort((a, b) => a.key.localeCompare(b.key))

  interface NonFailureItem {
    readonly entry: RailEntry
    readonly updatedAt: number
  }

  const items: NonFailureItem[] = []

  if (input.droppedAggregate > 0) {
    items.push({
      entry: {
        key: "dropped:aggregate",
        source: { kind: "timeline", instance: "aggregate" },
        label: "Timeline",
        value: `${input.droppedAggregate} dropped`,
        severity: "warn",
        stale: false,
        target: "timeline",
      },
      updatedAt: input.now,
    })
  }

  for (const entry of input.indicators) {
    const base: RailEntry = {
      key: `indicator:${sourceKey(entry.id)}:${entry.indicator.id}`,
      source: entry.id,
      label: entry.indicator.label,
      value: entry.indicator.value,
      severity: entry.indicator.severity,
      stale: input.now - entry.indicator.updatedAt > input.staleAfterMs,
      ...(entry.indicator.target === undefined ? {} : { target: entry.indicator.target }),
    }
    items.push({
      entry: base,
      updatedAt: entry.indicator.updatedAt,
    })
  }

  items.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.entry.severity] - SEVERITY_RANK[b.entry.severity]
    if (severityDiff !== 0) return severityDiff
    const freshnessDiff = b.updatedAt - a.updatedAt
    if (freshnessDiff !== 0) return freshnessDiff
    return a.entry.key.localeCompare(b.entry.key)
  })

  return [...failureEntries, ...items.map((item) => item.entry)]
}

/** The rail's progressive disclosure: the highest-priority rows plus a count of the rest. */
export interface RailSplit {
  readonly visible: readonly RailEntry[]
  readonly overflowCount: number
}

/**
 * Split prioritized entries into the rows the rail shows and the number collapsed behind the
 * overflow button. Prioritization — not width — decides what stays visible, so the choice is
 * deterministic and testable; container queries shrink presentation (labels, padding), never the
 * set.
 */
export function splitRailOverflow(entries: readonly RailEntry[], maxVisible: number): RailSplit {
  const cap = Math.max(1, maxVisible)
  return {
    visible: entries.slice(0, cap),
    overflowCount: Math.max(0, entries.length - cap),
  }
}
