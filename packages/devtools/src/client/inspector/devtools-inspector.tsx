"use client"

import { Button } from "@plainworks/elements/button"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import { cn } from "@plainworks/theme"
import { XIcon } from "lucide-react"
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { sourceKey } from "../../protocol"
import type { DevtoolsClientPort } from "../../session"
import type { DevtoolsStore, DevtoolsStoreState } from "../../store"
import type { DevtoolsDockSide } from "../dock/layout"
import { useDevtoolsLabels } from "../labels"
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
  /** Called when the user asks to close (Escape inside the panel or the close button). */
  readonly onOpenChange: (open: boolean) => void
  /** Viewport edge the panel docks to, beside the bar. Defaults to `bottom`. */
  readonly side?: DevtoolsDockSide
  /** Controls placed in the header before the close button, such as the dock side picker. */
  readonly actions?: ReactNode
  /** A resize handle, placed on the panel's edge that faces the host. */
  readonly resizeHandle?: ReactNode
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
  /** Element id for the panel, so a launcher can reference it with `aria-controls`. */
  readonly id?: string
}

// The panel sits beside the bar on the docked edge, sized by the root's panel-size property — the
// value the host reservation reads too, so the panel and the host's padding always agree. Its
// resize handle comes first, so the flex direction puts it on the edge that faces the host.
const SIDE_LAYOUT: Readonly<Record<DevtoolsDockSide, string>> = {
  bottom:
    "right-0 bottom-(--plainworks-devtools-bar-size) left-0 h-(--plainworks-devtools-panel-size) max-h-full flex-col border-t",
  left: "top-0 bottom-0 left-(--plainworks-devtools-bar-size) w-(--plainworks-devtools-panel-size) max-w-full flex-row-reverse border-r",
  right:
    "top-0 right-(--plainworks-devtools-bar-size) bottom-0 w-(--plainworks-devtools-panel-size) max-w-full flex-row border-l",
}

/**
 * The full inspector: a docked, non-modal workspace beside the host with an Overview, the unified
 * Timeline, and one panel per source kind. It never dims, blurs, or traps the host — the host
 * reserves the panel's space and stays usable while you watch it. Opening moves focus into the
 * panel; closing returns it to where it was, unless you already moved on into the host. Kinds
 * without an injected renderer render through the generic source panel.
 */
export function DevtoolsInspector({
  open,
  target,
  ...props
}: DevtoolsInspectorProps): ReactElement | null {
  // The tab lives above the conditional panel so closing keeps the last-used view; only a newly
  // supplied target moves it.
  const [tab, setTab] = useState(target ?? "overview")
  const [appliedTarget, setAppliedTarget] = useState(target)
  if (target !== appliedTarget) {
    setAppliedTarget(target)
    if (target !== undefined) setTab(target)
  }
  return open ? <InspectorPanel {...props} tab={tab} onTabChange={setTab} /> : null
}

interface InspectorPanelProps extends Omit<DevtoolsInspectorProps, "open" | "target"> {
  readonly tab: string
  readonly onTabChange: (tab: string) => void
}

function InspectorPanel({
  onOpenChange,
  side = "bottom",
  actions,
  resizeHandle,
  state,
  store,
  port,
  renderers,
  id,
  tab,
  onTabChange,
}: InspectorPanelProps): ReactElement {
  const labels = useDevtoolsLabels()
  const generatedId = useId()
  const panelId = id ?? `${generatedId}-inspector`
  const titleId = `${panelId}-title`
  const panelRef = useRef<HTMLElement>(null)
  const kinds = useMemo(
    () => [...new Set(state.sources.map((source) => source.id.kind))].sort(),
    [state.sources],
  )
  // A tab can outlive its panel: its source kind may deregister, or a custom indicator may open
  // an unknown target. Fall back to Overview so the tabs never show a value with no panel.
  const activeTab =
    tab === "overview" || tab === "timeline" || kinds.includes(tab) ? tab : "overview"

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel === null) return
    const doc = panel.ownerDocument
    const previous = doc.activeElement
    panel.focus({ preventScroll: true })
    return () => {
      // Non-modal: restore focus only when it was still ours — inside the panel, or dropped to
      // the body when the panel unmounted. Focus the developer moved into the host stays put.
      const active = doc.activeElement
      const stillOurs = active === null || active === doc.body || panel.contains(active)
      if (stillOurs && previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return
    event.preventDefault()
    onOpenChange(false)
  }

  return (
    <section
      ref={panelRef}
      id={panelId}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-dock={side}
      onKeyDown={handleKeyDown}
      className={cn(
        "fixed z-overlay flex bg-popover text-popover-foreground shadow-overlay",
        SIDE_LAYOUT[side],
      )}
    >
      {resizeHandle}
      <div className="@container/inspector flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-start gap-2 border-b px-4 py-2.5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 id={titleId} className="font-medium text-sm">
              {labels.inspectorTitle}
            </h2>
            <p className="text-muted-foreground text-xs">{labels.inspectorDescription}</p>
          </div>
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.closeInspector}
            onClick={() => onOpenChange(false)}
          >
            <XIcon aria-hidden />
          </Button>
        </header>
        <Tabs value={activeTab} onValueChange={onTabChange} className="min-h-0 flex-1 gap-0">
          <TabsList
            variant="line"
            aria-label={labels.inspectorViews}
            className="no-scrollbar w-full shrink-0 justify-start overflow-x-auto border-b px-2"
          >
            <TabsTrigger value="overview" className="flex-none">
              {labels.overview}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex-none">
              {labels.timeline}
            </TabsTrigger>
            {kinds.map((kind) => (
              <TabsTrigger key={kind} value={kind} className="flex-none">
                {kind}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
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
          </div>
        </Tabs>
      </div>
    </section>
  )
}

interface KindPanelProps {
  readonly kind: string
  readonly state: DevtoolsStoreState
  readonly port: DevtoolsClientPort
  readonly renderers: SourceRendererMap | undefined
}

function KindPanel({ kind, state, port, renderers }: KindPanelProps): ReactElement | null {
  const labels = useDevtoolsLabels()
  const instances = state.sources.filter((source) => source.id.kind === kind)
  const [selectedKey, setSelectedKey] = useState<string>()
  const selected = instances.find((source) => sourceKey(source.id) === selectedKey) ?? instances[0]
  if (selected === undefined) return null
  const props: SourcePanelProps = panelPropsFor(state, selected.id, port, labels)
  const Custom = renderers?.[kind]
  // Keyed by source so per-source UI state (an open confirmation, a custom renderer's own state)
  // never carries over to another instance.
  const activeKey = sourceKey(selected.id)
  return (
    <div className="grid gap-3">
      {instances.length < 2 ? null : (
        <NativeSelect
          aria-label={labels.instance}
          size="sm"
          value={activeKey}
          onChange={(event) => setSelectedKey(event.currentTarget.value)}
          className="min-w-48"
        >
          {instances.map((source) => (
            <NativeSelectOption key={sourceKey(source.id)} value={sourceKey(source.id)}>
              {source.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {Custom === undefined ? (
        <GenericSourcePanel key={activeKey} {...props} />
      ) : (
        // The package stylesheet leaves this slot to the host, whose styles own the renderer.
        <div key={activeKey} data-plainworks-devtools-slot="">
          <Custom {...props} />
        </div>
      )}
    </div>
  )
}
