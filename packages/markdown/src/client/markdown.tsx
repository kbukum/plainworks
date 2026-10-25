"use client"

import { cn } from "@plainworks/theme"
import { CopyButton } from "@plainworks/ui/clipboard/copy-button"
import { type ComponentProps, isValidElement, type ReactElement, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { safeMarkdownUrl } from "../url"

/** The default bound on rendered source: 64 KiB of text. */
export const DEFAULT_MARKDOWN_MAX_LENGTH: number = 64 * 1024

/** The visible strings a {@link Markdown} renders, for localization. */
export interface MarkdownLabels {
  /** Names a code block without a language. */
  readonly code: string
  /** Shown after source cut at `maxLength`. */
  readonly truncated: string
  /** Names a link that stands in for an image, given the image's alt text. */
  readonly image: (alt: string) => string
  readonly taskDone: string
  readonly taskOpen: string
}

export const defaultMarkdownLabels: MarkdownLabels = {
  code: "Code",
  truncated: "Text shortened.",
  image: (alt) => (alt === "" ? "Image" : `Image: ${alt}`),
  taskDone: "Done",
  taskOpen: "Not done",
}

/** Props for {@link Markdown}. */
export interface MarkdownProps {
  /** Untrusted Markdown source, such as a model's answer. */
  readonly children: string
  /** Characters rendered at most; the rest is cut with a note. Defaults to 64 KiB. */
  readonly maxLength?: number | undefined
  readonly labels?: Partial<MarkdownLabels> | undefined
  readonly className?: string | undefined
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function languageOf(node: ReactNode): string | undefined {
  const code = Array.isArray(node) ? node[0] : node
  if (!isValidElement<{ className?: string }>(code)) return undefined
  return /(?:^|\s)language-([\w+#.-]+)/.exec(code.props.className ?? "")?.[1]
}

function components(labels: MarkdownLabels): Components {
  return {
    a: ({ href, children }) =>
      href === undefined || href === "" ? (
        <span>{children}</span>
      ) : (
        <a
          href={href}
          rel="noopener noreferrer nofollow ugc"
          className="font-medium text-primary underline underline-offset-4"
        >
          {children}
        </a>
      ),
    // Images are never loaded: a remote image would leak the reader's address to any host the text
    // names. The alt text links to the image instead.
    img: ({ src, alt }) => {
      const name = labels.image(alt ?? "")
      return typeof src === "string" && src !== "" ? (
        <a
          href={src}
          rel="noopener noreferrer nofollow ugc"
          className="font-medium text-primary underline underline-offset-4"
        >
          {name}
        </a>
      ) : (
        <span>{name}</span>
      )
    },
    pre: ({ children }) => {
      const code = textOf(children).replace(/\n$/, "")
      const language = languageOf(children)
      const name = language ?? labels.code
      return (
        <figure className="my-3 overflow-hidden rounded-lg border bg-muted/40">
          <figcaption className="flex items-center justify-between gap-2 border-b px-3 py-1">
            <span className="font-mono text-xs text-muted-foreground">{name}</span>
            <CopyButton text={code} context={name} variant="ghost" className="min-h-6" />
          </figcaption>
          {/* A long line scrolls, so the block takes focus for keyboard scrolling. */}
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable. */}
          <pre tabIndex={0} className="overflow-x-auto p-3 text-sm">
            <code>{code}</code>
          </pre>
        </figure>
      )
    },
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
    input: ({ checked }) => (
      <span className="me-1">
        <span aria-hidden="true">{checked === true ? "☑" : "☐"}</span>
        <span className="sr-only">{checked === true ? labels.taskDone : labels.taskOpen}</span>
      </span>
    ),
    table: ({ children }) => (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable.
      <div tabIndex={0} className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children, style }) => (
      <th className="border px-2 py-1 text-start font-medium" style={style}>
        {children}
      </th>
    ),
    td: ({ children, style }) => (
      <td className="border px-2 py-1" style={style}>
        {children}
      </td>
    ),
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc ps-6">{children}</ul>,
    ol: ({ children, start }) => (
      <ol className="my-2 list-decimal ps-6" start={start}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-s-2 ps-3 text-muted-foreground">{children}</blockquote>
    ),
    h1: ({ children }) => <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>,
    h2: ({ children }) => <h4 className="mt-3 mb-2 text-base font-semibold">{children}</h4>,
    h3: ({ children }) => <h5 className="mt-3 mb-2 text-sm font-semibold">{children}</h5>,
    h4: ({ children }) => <h6 className="mt-3 mb-2 text-sm font-semibold">{children}</h6>,
    h5: ({ children }) => <p className="mt-3 mb-2 text-sm font-semibold">{children}</p>,
    h6: ({ children }) => <p className="mt-3 mb-2 text-sm font-semibold">{children}</p>,
    hr: () => <hr className="my-3" />,
  }
}

type UrlTransform = NonNullable<ComponentProps<typeof ReactMarkdown>["urlTransform"]>

// Every URL (links and images) goes through the link policy; a refused URL renders as text.
const urlTransform: UrlTransform = (url) => safeMarkdownUrl(url) ?? ""

/**
 * Renders untrusted Markdown, such as a model's answer, with GitHub-flavored tables, task lists and
 * strikethrough. Raw HTML is dropped, links keep only absolute `http`, `https` and `mailto` URLs,
 * images are never loaded, and source past `maxLength` is cut with a note. Headings start at level
 * 3, so the text never outranks the page around it. Code blocks show their language and a copy
 * button; there is no syntax highlighting.
 */
export function Markdown({
  children,
  maxLength = DEFAULT_MARKDOWN_MAX_LENGTH,
  labels,
  className,
}: MarkdownProps): ReactElement {
  const names = { ...defaultMarkdownLabels, ...labels }
  const cut = children.length > maxLength
  return (
    <div data-slot="markdown" className={cn("text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={urlTransform}
        components={components(names)}
      >
        {cut ? children.slice(0, maxLength) : children}
      </ReactMarkdown>
      {cut ? <p className="mt-2 text-xs text-muted-foreground">{names.truncated}</p> : null}
    </div>
  )
}
