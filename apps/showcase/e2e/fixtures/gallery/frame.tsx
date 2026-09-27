import type { ReactElement, ReactNode } from "react"

/** A fixed calendar day, so date atoms render the same month on every run. */
export const FIXED_DATE: Date = new Date(2026, 2, 14)

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** One gallery group: the page heading and its sections. */
export function Category({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  )
}

/** One component in the group, labelled so a test can find it by name. */
export function Section({ name, children }: { name: string; children: ReactNode }): ReactElement {
  const id = `gallery-${slug(name)}`
  return (
    <section
      data-gallery-section={slug(name)}
      aria-labelledby={id}
      className="flex flex-col gap-3 border-t pt-4"
    >
      <h2 id={id} className="text-lg font-semibold">
        {name}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  )
}

/** A labelled row of variants inside a section. */
export function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  )
}

/** A muted placeholder block for layout primitives. */
export function Box({ children }: { children: ReactNode }): ReactElement {
  return <div className="rounded-md bg-muted p-4 text-sm">{children}</div>
}
