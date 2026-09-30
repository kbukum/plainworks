"use client"

// Client public entry for `@plainworks/devtools` — a re-export-only barrel over the DOM/React
// inspector concerns (shell, rail, inspector views, copy, extension model, mounting). The neutral
// `.` entry stays free of this graph. Importing this entry performs no work: mounting is explicit
// (`mountDevtools` or `DevtoolsShell`), always behind the host's build-time development gate.
export {
  createDevtoolsLayoutSource,
  DEVTOOLS_DOCK_SIDES,
  DEVTOOLS_LAYOUT_KEY,
  type DevtoolsDockSide,
  type DevtoolsLayout,
  type DevtoolsLayoutSourceOptions,
  isDevtoolsLayout,
} from "./client/dock"
export {
  CommandSection,
  type CommandSectionProps,
  DetailPanel,
  type DetailPanelProps,
  DevtoolsInspector,
  type DevtoolsInspectorProps,
  EventList,
  type EventListProps,
  GenericSourcePanel,
  JsonTree,
  type JsonTreeProps,
  OverviewView,
  type OverviewViewProps,
  panelPropsFor,
  type SourcePanel,
  type SourcePanelProps,
  type SourceRendererMap,
  TimelineView,
  type TimelineViewProps,
} from "./client/inspector"
export { type DevtoolsLabels, defaultDevtoolsLabels } from "./client/labels"
export { type DevtoolsMount, type MountDevtoolsOptions, mountDevtools } from "./client/mount"
export {
  buildRailEntries,
  DiagnosticsRail,
  type DiagnosticsRailProps,
  type RailEntry,
  type RailInput,
  type RailSplit,
  splitRailOverflow,
} from "./client/rail"
export {
  type DevtoolsConnection,
  DevtoolsShell,
  type DevtoolsShellProps,
  useDevtoolsConnection,
  useNow,
} from "./client/shell"
