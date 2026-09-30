import type { Severity } from "../../protocol"
import type { DevtoolsDockSide } from "../dock/layout"

/**
 * Every user-facing string of the devtools client, injected so the inspector ships no hardcoded
 * copy. All fields have English defaults ({@link defaultDevtoolsLabels}); a host overrides any
 * subset through the `labels` option of `DevtoolsShell` or `mountDevtools`. Text that embeds a
 * value is a function of that value.
 */
export interface DevtoolsLabels {
  /** Accessible name of the docked bar. */
  readonly bar: string
  /** Text of the button that opens and closes the inspector. */
  readonly inspect: string

  /** Accessible name of the diagnostics rail. */
  readonly diagnostics: string
  /** Accessible name of a rail entry, from its label and value. */
  readonly railEntry: (label: string, value: string) => string
  /** Accessible name of a rail entry whose value is older than the freshness window. */
  readonly staleRailEntry: (label: string, value: string) => string
  /** The rail's overflow button, from the number of entries it hides. */
  readonly showMore: (count: number) => string
  /** Rail value of a failed source. */
  readonly failed: string
  /** Rail value of the aggregate dropped-event warning, from the dropped count. */
  readonly railDropped: (count: number) => string

  /** Heading of the inspector panel. */
  readonly inspectorTitle: string
  /** Helper text under the inspector heading. */
  readonly inspectorDescription: string
  /** Accessible name of the inspector's close button. */
  readonly closeInspector: string
  /** Accessible name of the inspector's view tabs. */
  readonly inspectorViews: string
  /** The Overview tab and region. */
  readonly overview: string
  /** The Timeline tab, region, and rail entry. */
  readonly timeline: string
  /** Accessible name of the instance picker shown when a kind has several sources. */
  readonly instance: string

  /** Accessible name of the dock side toggle group. */
  readonly dockSide: string
  /** Accessible name of one dock side toggle. */
  readonly dockTo: (side: DevtoolsDockSide) => string
  /** Status shown when the saved layout cannot be read. */
  readonly layoutRestoreFailed: string
  /** Status shown when the layout cannot be saved. */
  readonly layoutSaveFailed: string
  /** Accessible name of the panel resize handle. */
  readonly resizeInspector: string

  /** Empty-state title when no source is registered. */
  readonly noSources: string
  /** Empty-state description when no source is registered. */
  readonly noSourcesDescription: string
  /** Accessible name of the Overview's source list. */
  readonly sources: string
  /** Badge of a healthy source. */
  readonly observing: string
  /** A source failure, from the source label and the failure message. */
  readonly sourceFailed: (source: string, message: string) => string
  /** Title of the notice shown when events were dropped. */
  readonly timelineIncomplete: string
  /** Body of the dropped-events notice, from the aggregate dropped count. */
  readonly eventsReleased: (count: number) => string
  /** A source's advertised command count. */
  readonly commandCount: (count: number) => string
  /** A source's dropped-event count. */
  readonly sourceDropped: (count: number) => string

  /** Accessible name of the timeline toolbar. */
  readonly timelineControls: string
  /** Pauses the timeline. */
  readonly pause: string
  /** Resumes a paused timeline. */
  readonly resume: string
  /** Clears the visible timeline history. */
  readonly clear: string
  /** Accessible name of the source filter. */
  readonly sourceFilter: string
  /** The source filter's catch-all option. */
  readonly allSources: string
  /** Accessible name of the severity filter. */
  readonly severityFilter: string
  /** The severity filter's catch-all option. */
  readonly allSeverities: string
  /** Display name of a severity, in the filter and on event rows. */
  readonly severity: (severity: Severity) => string
  /** Accessible name of the kind filter. */
  readonly kindFilter: string
  /** Placeholder of the kind filter. */
  readonly kindPlaceholder: string
  /** Empty state of a timeline with no retained events. */
  readonly noEvents: string
  /** Empty state of a timeline whose filters match nothing. */
  readonly noMatchingEvents: string
  /** Timeline status when every event shows, from the event count. */
  readonly eventCount: (count: number) => string
  /** Timeline status when filters hide events, from the visible and total counts. */
  readonly filteredEventCount: (visible: number, total: number) => string
  /** Timeline status part for dropped events, from the aggregate dropped count. */
  readonly timelineDropped: (count: number) => string
  /** Timeline status part while paused. */
  readonly paused: string

  /** Accessible name of an event list. */
  readonly events: string
  /** Text of an event's detail disclosure. */
  readonly details: string
  /** Accessible name of an event's detail disclosure, from the event label. */
  readonly eventDetails: (event: string) => string
  /** Accessible name of the detail loading indicator. */
  readonly loadingDetail: string
  /** Shown when detail fails without a message of its own. */
  readonly detailFailed: string

  /** Accessible name of a source's command section, from the source label. */
  readonly commands: (source: string) => string
  /** Marker beside a command that mutates state. */
  readonly mutatesState: string
  /** Warning inside a destructive command's confirmation, from the command label. */
  readonly destructiveWarning: (command: string) => string
  /** Dismisses a destructive command's confirmation. */
  readonly cancel: string
  /** Runs a destructive command, and names its confirmation, from the command label. */
  readonly confirmCommand: (command: string) => string
  /** A command's success, from its label and its result when it returned one. */
  readonly commandSucceeded: (command: string, result: string | undefined) => string
  /** A command's failure, from its label and the failure message. */
  readonly commandFailed: (command: string, message: string) => string
  /** Failure message when an error carries none. */
  readonly unknownError: string
}

const SEVERITY_NAMES: Readonly<Record<Severity, string>> = {
  ok: "OK",
  info: "Info",
  warn: "Warning",
  error: "Error",
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

/** English defaults for every {@link DevtoolsLabels} field. */
export const defaultDevtoolsLabels: DevtoolsLabels = {
  bar: "Plainworks devtools",
  inspect: "Inspect",

  diagnostics: "Diagnostics",
  railEntry: (label, value) => `${label}: ${value}`,
  staleRailEntry: (label, value) => `${label}: ${value} (stale)`,
  showMore: (count) => `Show ${plural(count, "more diagnostic", "more diagnostics")}`,
  failed: "Failed",
  railDropped: (count) => `${count} dropped`,

  inspectorTitle: "Plainworks inspector",
  inspectorDescription: "Observation is read-only. Commands are marked by risk.",
  closeInspector: "Close inspector",
  inspectorViews: "Inspector views",
  overview: "Overview",
  timeline: "Timeline",
  instance: "Instance",

  dockSide: "Dock side",
  dockTo: (side) => `Dock to ${side}`,
  layoutRestoreFailed: "Saved layout unreadable",
  layoutSaveFailed: "Layout not saved",
  resizeInspector: "Resize inspector",

  noSources: "No sources registered",
  noSourcesDescription:
    "Construct adapters beside your runtime instances and register them with the devtools session.",
  sources: "Sources",
  observing: "Observing",
  sourceFailed: (source, message) => `${source} failed: ${message}`,
  timelineIncomplete: "The timeline is incomplete",
  eventsReleased: (count) =>
    `${count} events dropped — retention is bounded, so the oldest events were released.`,
  commandCount: (count) => plural(count, "command", "commands"),
  sourceDropped: (count) => `${count} events dropped`,

  timelineControls: "Timeline controls",
  pause: "Pause",
  resume: "Resume",
  clear: "Clear",
  sourceFilter: "Source",
  allSources: "All sources",
  severityFilter: "Severity",
  allSeverities: "All severities",
  severity: (severity) => SEVERITY_NAMES[severity],
  kindFilter: "Kind",
  kindPlaceholder: "Filter by kind",
  noEvents: "No events recorded yet",
  noMatchingEvents: "No events match the filters",
  eventCount: (count) => plural(count, "event", "events"),
  filteredEventCount: (visible, total) => `${visible} of ${total} events`,
  timelineDropped: (count) => `${count} dropped (retention is bounded)`,
  paused: "paused",

  events: "Events",
  details: "Details",
  eventDetails: (event) => `Details for ${event}`,
  loadingDetail: "Loading detail",
  detailFailed: "The detail could not be loaded.",

  commands: (source) => `${source} commands`,
  mutatesState: "Mutates state",
  destructiveWarning: (command) =>
    `${command} is destructive and cannot be undone from the inspector.`,
  cancel: "Cancel",
  confirmCommand: (command) => `Confirm ${command}`,
  commandSucceeded: (command, result) => `${command}: ${result ?? "done"}`,
  commandFailed: (command, message) => `${command} failed: ${message}`,
  unknownError: "Unknown error",
}
