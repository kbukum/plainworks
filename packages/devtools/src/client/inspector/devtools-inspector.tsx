"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plainworks/elements/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@plainworks/elements/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { sourceKey } from "../../protocol"
import type { DevtoolsClientPort } from "../../session"
import type { DevtoolsStore, DevtoolsStoreState } from "../../store"
import { OverviewView } from "./overview-view"
import {
  GenericSourcePanel,
  panelPropsFor,
  type SourcePanelProps,
  type SourceRendererMap,
} from "./source-panel"
import { TimelineView } from "./timeline-view"

/** Props for {@link DevtoolsInspector}. */
export interface DevtoolsInspectorProps {
  /** Controlled open state. */
  readonly open: boolean
  /** Called when the user asks to close (Escape, close button, backdrop). */
  readonly onOpenChange: (open: boolean) => void
  /** Edge the inspector docks to. Defaults to `right`. */
  readonly dock?: "right" | "bottom"
  /** Current store state. */
  readonly state: DevtoolsStoreState
  /** The store, for timeline presentation policies. */
  readonly store: DevtoolsStore
  /** The client port, for on-demand detail and commands. */
  readonly port: DevtoolsClientPort
  /** Kind-keyed custom panels, injected at the call site. */
  readonly renderers?: SourceRendererMap
  /** View to activate when opening (`"overview"`, `"timeline"`, or a source kind). */
  readonly target?: string
}

/**
 * The full inspector: a focus-managed, dockable sheet with an Overview, the unified Timeline, and
 * one panel per source kind. Kinds without an injected renderer render through the generic
 * source panel, so unknown and app-specific sources stay inspectable. The sheet atom owns focus
 * trapping and restoration.
 */
export function DevtoolsInspector({
  open,
  onOpenChange,
  dock = "right",
  state,
  store,
  port,
  renderers,
  target,
}: DevtoolsInspectorProps): ReactElement {
  const kinds = useMemo(
    () => [...new Set(state.sources.map((source) => source.id.kind))].sort(),
    [state.sources],
  )
  const [tab, setTab] = useState(target ?? "overview")
  useEffect(() => {
    if (open && target !== undefined) setTab(target)
  }, [open, target])
  // A controlled tab can outlive its panel: its source kind may deregister, or a custom indicator
  // may open an unknown target. Fall back to Overview so the sheet never renders a value with no
  // matching trigger or content.
  const activeTab =
    tab === "overview" || tab === "timeline" || kinds.includes(tab) ? tab : "overview"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={dock}
        className={
          dock === "right"
            ? "@container w-[min(100%,48rem)] sm:max-w-none"
            : "@container h-[min(85dvh,40rem)]"
        }
      >
        <SheetHeader>
          <SheetTitle>Plainworks inspector</SheetTitle>
          <SheetDescription>
            Observe the registered runtime sources. Observation is read-only; commands are marked by
            risk.
          </SheetDescription>
        </SheetHeader>
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        >
          <TabsList aria-label="Inspector views" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            {kinds.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {kind}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <OverviewView state={state} />
          </TabsContent>
          <TabsContent value="timeline">
            <TimelineView state={state} store={store} port={port} />
          </TabsContent>
          {kinds.map((kind) => (
            <TabsContent key={kind} value={kind}>
              <KindPanel kind={kind} state={state} port={port} renderers={renderers} />
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

interface KindPanelProps {
  readonly kind: string
  readonly state: DevtoolsStoreState
  readonly port: DevtoolsClientPort
  readonly renderers: SourceRendererMap | undefined
}

function KindPanel({ kind, state, port, renderers }: KindPanelProps): ReactElement | null {
  const instances = state.sources.filter((source) => source.id.kind === kind)
  const [selectedKey, setSelectedKey] = useState<string>()
  const selected = instances.find((source) => sourceKey(source.id) === selectedKey) ?? instances[0]
  if (selected === undefined) return null
  const props: SourcePanelProps = panelPropsFor(state, selected.id, port)
  const Panel = renderers?.[kind] ?? GenericSourcePanel
  return (
    <div className="grid gap-3">
      {instances.length < 2 ? null : (
        <Select
          value={sourceKey(selected.id)}
          onValueChange={(value) => {
            if (value !== null) setSelectedKey(value)
          }}
          items={instances.map((source) => ({ value: sourceKey(source.id), label: source.label }))}
        >
          <SelectTrigger aria-label="Instance" size="sm" className="w-fit min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {instances.map((source) => (
              <SelectItem key={sourceKey(source.id)} value={sourceKey(source.id)}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Panel {...props} />
    </div>
  )
}
