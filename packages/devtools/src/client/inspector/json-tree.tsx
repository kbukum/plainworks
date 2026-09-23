"use client"

import { isRecord } from "@plainworks/std"
import { ChevronRight } from "lucide-react"
import { type ReactElement, useState } from "react"
import type { Json } from "../../privacy"

/** Props for {@link JsonTree}. */
export interface JsonTreeProps {
  /** The already-sanitized value to render; depth and size were bounded at the session. */
  readonly value: Json
}

/**
 * A read-only, keyboard-operable tree over a sanitized JSON value. Collections nest behind
 * disclosure buttons; the two outermost levels start expanded so a detail answer reads without
 * clicking, and deeper levels collapse to keep large payloads scannable.
 */
export function JsonTree({ value }: JsonTreeProps): ReactElement {
  return (
    <div className="font-mono text-xs leading-5" data-json-tree="">
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
      <Collection
        name={name}
        summary={`[${value.length}]`}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
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
      <Collection
        name={name}
        summary={`{${keys.length}}`}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
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
  readonly onToggle: () => void
  readonly children: React.ReactNode
}

function Collection({ name, summary, open, onToggle, children }: CollectionProps): ReactElement {
  return (
    <div className="pl-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="inline-flex min-h-6 items-center gap-1 rounded-sm text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight
          aria-hidden
          className={`size-3 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        {name === undefined ? null : <span className="text-muted-foreground">{name}</span>}
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open ? <div className="border-border/60 border-l pl-2">{children}</div> : null}
    </div>
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
      <span className="break-all">{text}</span>
    </div>
  )
}

function scalarText(value: Json): string {
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  return String(value as number | boolean)
}
