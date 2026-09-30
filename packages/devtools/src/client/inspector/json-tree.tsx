"use client"

import { Button } from "@plainworks/elements/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plainworks/elements/collapsible"
import { isRecord } from "@plainworks/std"
import type { Json } from "@plainworks/std/encoding"
import { cn } from "@plainworks/theme"
import { ChevronRight } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"

/** Props for {@link JsonTree}. */
export interface JsonTreeProps {
  /** The already-sanitized value to render; depth and size were bounded at the session. */
  readonly value: Json
}

/**
 * A read-only, keyboard-operable tree over a sanitized JSON value. Collections nest behind
 * collapsible disclosures; the two outermost levels start expanded so a detail answer reads without
 * clicking, and deeper levels collapse to keep large payloads scannable.
 */
export function JsonTree({ value }: JsonTreeProps): ReactElement {
  return (
    <div className="min-w-0 font-mono text-xs leading-5" data-json-tree="">
      <JsonNode name={undefined} value={value} depth={0} />
    </div>
  )
}

interface JsonNodeProps {
  readonly name: string | undefined
  readonly value: Json
  readonly depth: number
}

function JsonNode({ name, value, depth }: JsonNodeProps): ReactElement {
  const [open, setOpen] = useState(depth < 2)

  if (Array.isArray(value)) {
    if (value.length === 0) return <Leaf name={name} text="[]" />
    return (
      <Collection name={name} summary={`[${value.length}]`} open={open} onOpenChange={setOpen}>
        {value.map((item, index) => (
          // Sanitized payloads are read-only here, so positional keys never reorder.
          <JsonNode key={index} name={String(index)} value={item} depth={depth + 1} />
        ))}
      </Collection>
    )
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) return <Leaf name={name} text="{}" />
    return (
      <Collection name={name} summary={`{${keys.length}}`} open={open} onOpenChange={setOpen}>
        {keys.map((key) => (
          <JsonNode key={key} name={key} value={value[key] ?? null} depth={depth + 1} />
        ))}
      </Collection>
    )
  }
  return <Leaf name={name} text={scalarText(value)} />
}

interface CollectionProps {
  readonly name: string | undefined
  readonly summary: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly children: ReactNode
}

function Collection({
  name,
  summary,
  open,
  onOpenChange,
  children,
}: CollectionProps): ReactElement {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="pl-3">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="h-auto min-h-6 justify-start px-1 font-mono font-normal text-muted-foreground aria-expanded:bg-transparent"
          />
        }
      >
        <ChevronRight
          aria-hidden
          className={cn("transition-transform motion-reduce:transition-none", open && "rotate-90")}
        />
        {name === undefined ? null : <span>{name}</span>}
        <span>{summary}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-border/60 border-l pl-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function Leaf({
  name,
  text,
}: {
  readonly name: string | undefined
  readonly text: string
}): ReactElement {
  return (
    <div className="pl-3">
      {name === undefined ? null : <span className="mr-1 text-muted-foreground">{name}</span>}
      <span className="wrap-anywhere">{text}</span>
    </div>
  )
}

function scalarText(value: Json): string {
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  return String(value as number | boolean)
}
