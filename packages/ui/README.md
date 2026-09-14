# `@plainworks/ui`

Plainworks-authored composites built on the owned atom set. The neutral entry contains pure theme resolution for SSR; interactive composites live behind explicit subpaths. The raw shadcn/Base-UI atoms themselves live in [`@plainworks/elements`](../elements/README.md) — `ui` composes them.

## Quickstart

Import this package's stylesheet once — it pulls in `@plainworks/elements` and the `@plainworks/theme` substrate and registers the shipped composites as a Tailwind `@source` — then adopt the atoms from `@plainworks/elements` and the composites from here:

```css
@import "@plainworks/ui/styles.css";
```

```tsx
import { Button } from "@plainworks/elements/button"
import { ThemeProvider, ThemeToggle } from "@plainworks/ui/theme"

export function Header({ themeSource, serverTheme }) {
  return (
    <ThemeProvider source={themeSource} initialTheme={serverTheme}>
      <ThemeToggle />
      <Button>Sign in</Button>
    </ThemeProvider>
  )
}
```

The tokens, color schemes, and stylesheet are owned by [`@plainworks/theme`](../theme/README.md); `@plainworks/ui` re-exports the neutral theme surface for convenience and adds the ready-made `ThemeToggle`.

## Components

The interactive composites live behind per-concern client subpaths, so you import only what a route uses. Each one is accessible and responsive by default and carries an axe test.

| Import | You get |
| --- | --- |
| `@plainworks/ui/layout` | `Stack`, `Grid`, `Split` — fluid, container-first layout primitives |
| `@plainworks/ui/feedback` | `Spinner`, `SkeletonText`, `Callout` — loading and status surfaces |
| `@plainworks/ui/display` | `DateValue`, `NumberValue` — SSR-stable `Intl` formatting |
| `@plainworks/ui/navigation` | `Breadcrumbs` — an accessible trail from an items array |
| `@plainworks/ui/overlays` | `Modal`, `Drawer`, `PopoverPanel` — labelled, controllable overlays |
| `@plainworks/ui/data-table` | `DataTable` — the controlled, sortable, selectable table exemplar |

```tsx
import { DataTable } from "@plainworks/ui/data-table"

<DataTable
  columns={[
    { id: "name", header: "Name", cell: (row) => row.name, sortable: true },
    { id: "role", header: "Role", cell: (row) => row.role, align: "end" },
  ]}
  rows={people}
  getRowId={(row) => row.id}
  selectable
/>
```

`DataTable` owns only view state (sort direction, row selection) and never reorders `rows`, so remote or paged data stays a prop you control. Copy and icons are injected through `labels`/`icons`.

## Hooks

Behaviour hooks ship from the client entry. The DOM-free stately hooks — `useControllableState`, `useSelection`, `useDisclosure`, `useListState` — are the controlled/uncontrolled foundation the composites are built on. The browser hooks — `useMediaQuery`, `useClipboard`, `useKeyboardShortcuts` — wrap DOM APIs with SSR-safe defaults and owned teardown.

```tsx
import { useSelection } from "@plainworks/ui/client"
import { useClipboard } from "@plainworks/ui/hooks"
```

## Atoms

You can pull an owned atom straight from `@plainworks/ui`, so a component and the atoms it composes come from one package:

```tsx
import { Button } from "@plainworks/ui/button"
```

Each atom is also available from `@plainworks/elements/*`; the `ui` subpath is a tree-shakeable re-export for convenience.

## Theme

Use `parseThemeCookie` and `resolveTheme` from the neutral `@plainworks/ui` entry (re-exported from `@plainworks/theme`) during SSR, then apply the returned `htmlClass` and `colorScheme` to `<html>` before hydration. On the client, pass a caller-owned `StateSource<ThemePreference>` to `ThemeProvider`; a cookie scope from `@plainworks/state/client/scope` keeps the value server-readable without creating a singleton or using browser storage directly.

```tsx
import { ThemeProvider, ThemeToggle } from "@plainworks/ui/theme"

<ThemeProvider source={themeSource} initialTheme={serverTheme}>
  <ThemeToggle />
</ThemeProvider>
```

## Error fallback

`ErrorFallback` is presentation only. Inject it into `@plainworks/app`'s behavioral error boundary so reset and reporting remain composition concerns.

## Relationship to `@plainworks/elements`

`ui` (L3) depends downward on `elements` (L2): the authored composites under `src/client` compose owned atoms and carry the accessibility, responsive, and axe-test acceptance bar. Keep any customization of an atom in a `ui` wrapper — never edit an atom in place, so the `elements` upstream `diff`/`update` stay meaningful. Atoms are available from either `@plainworks/elements/*` or the convenience `@plainworks/ui/*` re-export; composites come from `@plainworks/ui/*`.
