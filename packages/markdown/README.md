# @plainworks/markdown

> Safe rendering of untrusted Markdown as React elements.

Part of the [plainworks](../../README.md) kit. Use it for text you don't control, such as a model's answer.

## Install

```sh
bun add @plainworks/markdown
```

Import the stylesheet once. It pulls in `@plainworks/ui` and registers the renderer with your Tailwind build:

```css
@import "@plainworks/markdown/styles.css";
```

## Usage

```tsx
import { Markdown } from "@plainworks/markdown/markdown"

<Markdown>{answer}</Markdown>
```

It renders GitHub-flavored Markdown: tables, task lists, and strikethrough. Code blocks show their language and a copy button; there is no syntax highlighting.

## Safety

- Raw HTML is dropped, never rendered.
- Links keep only absolute `http`, `https`, and `mailto` URLs and get `rel="noopener noreferrer nofollow ugc"`. Anything else, including relative links, renders as plain text.
- Images are never loaded, because loading one would reveal the reader to the image's host. The alt text becomes a link to the image instead.
- Source longer than `maxLength` (64 KiB by default) is cut with a note.
- Headings start at level 3, so the text never outranks the page around it.

The link policy is also available on its own, with no React or DOM: `safeMarkdownUrl` from `@plainworks/markdown`.

Pass `labels` to localize the strings the renderer adds (code block name, cut note, image link, task states).

## Dependencies

| Dependency | Why |
|---|---|
| `react-markdown` | Parses Markdown to React elements without `dangerouslySetInnerHTML`, with hooks to drop HTML and filter URLs. |
| `remark-gfm` | Adds the GitHub-flavored syntax (tables, task lists, strikethrough) models commonly write. |
| `@plainworks/ui` | The copy button for code blocks. |
| `@plainworks/theme` | Class merging for the renderer's styles. |
