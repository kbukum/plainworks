# `@plainworks/ui`

Plainworks-authored composites built on the vendored atom set. The neutral entry contains pure theme resolution for SSR; interactive composites live behind explicit subpaths. The raw shadcn/Base-UI atoms themselves live in [`@plainworks/elements`](../elements/README.md) — `ui` composes them.

## Quickstart

Add both `@plainworks/ui` and `@plainworks/elements` to your app's dependencies. Atoms are imported straight from `@plainworks/elements`, and a strict package manager (pnpm, Yarn PnP) will not resolve it through `ui`'s transitive graph.

Import the stylesheet once — it pulls in `@plainworks/elements` and the `@plainworks/theme` substrate and registers the shipped composites as a Tailwind `@source`:

```css
@import "@plainworks/ui/styles.css";
```

Then import atoms from `@plainworks/elements` and composites from `@plainworks/ui`:

```tsx
import { Button } from "@plainworks/elements/button"
import { ThemeModeMenu, ThemeProvider } from "@plainworks/ui/theme"

export function Header({ themeSource, serverTheme }) {
  return (
    <ThemeProvider source={themeSource} initialTheme={serverTheme}>
      <ThemeModeMenu />
      <ThemeSaveAlert />
      <Button>Sign in</Button>
    </ThemeProvider>
  )
}
```

`ThemeSaveAlert` is your own small component that announces a failed save; see [Theme](#theme). The tokens, color schemes, and stylesheet are owned by [`@plainworks/theme`](../theme/README.md); `@plainworks/ui` re-exports the neutral theme surface for convenience and adds ready-made color-mode controls.

## Components

The interactive composites live behind per-concern client subpaths, so you import only what a route uses. Each one is accessible and responsive by default and carries an axe test.

| Import | You get |
| --- | --- |
| `@plainworks/ui/shell` | `AppShell` — the app frame: header, navigation rail or drawer, skip link, and main landmark |
| `@plainworks/ui/page` | `Page`, `PageHeader`, `Section`, `Toolbar` — page structure with headings, widths, and spacing |
| `@plainworks/ui/layout` | `Stack`, `Grid`, `Split` — fluid, container-first layout primitives |
| `@plainworks/ui/feedback` | `LoadingState`, `EmptyState`, `ErrorState`, `AsyncState`, `Spinner`, `Callout` — region states and inline status |
| `@plainworks/ui/display` | `DateValue`, `NumberValue`, `StatusBadge` — SSR-stable `Intl` formatting and toned status labels |
| `@plainworks/ui/navigation` | `Breadcrumbs`, `NavList` — an accessible trail and a primary nav list that marks the current page |
| `@plainworks/ui/overlays` | `Modal`, `Drawer` — labelled, controllable overlays; a drawer body scrolls on its own |
| `@plainworks/ui/data-table` | `DataTable` — the controlled, sortable, selectable table exemplar |
| `@plainworks/ui/list` | `Pagination`, `FilterBar` — controlled paging and filter building over `std/list` |
| `@plainworks/ui/forms` | `Form`, the typed `*Field` set, `FormSubmit` — schema-validated forms on React 19 Actions |

`AppShell` frames the whole app. Navigation sits in a rail on wide screens and in a drawer behind a menu button on narrow ones, measured by the shell's own width. It adds a skip link and a named main landmark, and moves focus to main when the page changes. The rail and drawer copies of the navigation can both be mounted, so give each a unique label based on `placement`. Pass `renderLink` to `NavList` to use your router's link.

```tsx
import { NavList } from "@plainworks/ui/navigation"
import { AppShell } from "@plainworks/ui/shell"

<AppShell
  brand={<a href="/">Acme</a>}
  actions={<ThemeModeMenu />}
  mainLabel={page.title}
  navigationKey={page.id}
  navigation={({ placement, onNavigate }) => (
    <NavList
      label={placement === "rail" ? "Primary" : "Sections"}
      items={navItems}
      onNavigate={onNavigate}
    />
  )}
>
  <ThemeSaveAlert />
  {page.content}
</AppShell>
```

A page reads top-down: one `PageHeader`, then titled `Section`s. Each section is a labelled landmark, and each piece adapts to its own width, so it works in a sidebar or a full page.

```tsx
import { Page, PageHeader, Section, Toolbar } from "@plainworks/ui/page"

<Page>
  <PageHeader title="Orders" actions={<Button>New order</Button>} />
  <Section title="Recent orders">
    <Toolbar label="Order tools">{search}</Toolbar>
    {table}
  </Section>
</Page>
```

Every async region shows exactly one state: loading, error, empty, or content. `asyncStatus` picks it and runs anywhere, including on the server; `AsyncState` renders it. Errors always offer a way out, such as a retry.

```tsx
import { asyncStatus } from "@plainworks/ui"
import { AsyncState, EmptyState, ErrorState, LoadingState } from "@plainworks/ui/feedback"

<AsyncState
  status={asyncStatus({ pending: query.isPending, error: query.isError, empty: rows.length === 0 })}
  loading={<LoadingState label="Loading orders" />}
  error={<ErrorState title="Orders are unavailable" onRetry={query.refetch} />}
  empty={<EmptyState title="No orders yet" />}
>
  {table}
</AsyncState>
```

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

`DataTable` owns only view state (sort, selection, open row details) and never reorders `rows`, so remote or paged data stays a prop you control. On a narrow container, `priority: "low"` columns move into a per-row **details** disclosure, so no value is lost on a phone. Name rows with `getRowLabel`; copy and icons are injected through `labels`/`icons`.

`Form` validates on submit with any Standard Schema validator and passes the validated value to `onSubmit`; each field wires its own label, description, and error state.

```tsx
import { Form, TextField, FormSubmit } from "@plainworks/ui/forms"

<Form schema={signInSchema} onSubmit={signIn}>
  <TextField name="email" label="Email" />
  <TextField name="password" label="Password" type="password" />
  <FormSubmit>Sign in</FormSubmit>
</Form>
```

`Pagination` and `FilterBar` are controlled: they emit the same `std/list` request shape your query already holds, so paging and filtering key the cache and hit the backend with one contract. `FilterBar` stacks its controls when narrow, announces how many filters apply, offers **Clear all**, and keeps keyboard focus in place as rows come and go.

```tsx
import { Pagination, FilterBar } from "@plainworks/ui/list"

<FilterBar
  fields={[{ field: "status", label: "Status", type: "select", options: statusOptions }]}
  value={filters}
  onChange={setFilters}
/>
<Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
```

## Hooks

Behaviour hooks ship from the client entry. The DOM-free stately hooks — `useControllableState`, `useSelection`, `useDisclosure`, `useListState` — are the controlled/uncontrolled foundation the composites are built on. The browser hooks — `useMediaQuery`, `useClipboard`, `useKeyboardShortcuts` — wrap DOM APIs with SSR-safe defaults and owned teardown.

```tsx
import { useSelection } from "@plainworks/ui/client"
import { useClipboard } from "@plainworks/ui/hooks"
```

## Theme

Use `parseThemeCookie` and `resolveTheme` from the neutral `@plainworks/ui` entry (re-exported from `@plainworks/theme`) during SSR, then render the returned `htmlClass` on `<html>`. System mode adds no mode class, so the stylesheet follows the OS preference on the first paint. On the client, pass a caller-owned `StateSource<ThemePreference>` to `ThemeProvider`; a cookie scope from `@plainworks/state/client/scope` keeps the value server-readable without creating a singleton or using browser storage directly.

Two controls set the color mode. `ThemeModeMenu` is a compact header menu; `ThemeModeGroup` is an inline Light / Dark / System button group for a settings page. Both take optional `icons` and `labels`, so the kit ships no icon set and no fixed copy.

A save can fail, for example when the cookie write is rejected. The selection then stays unchanged and the failure lands on `useTheme().error`:

- `ThemeModeGroup` announces it below itself. Pass `announceError={false}` when the page already does.
- `ThemeModeMenu` has no room for an inline message. **Render one app-level alert yourself**, or the failure is silent.

```tsx
import { Callout } from "@plainworks/ui/feedback"
import {
  defaultThemeModeLabels,
  ThemeModeGroup,
  ThemeModeMenu,
  ThemeProvider,
  useTheme,
} from "@plainworks/ui/theme"

function ThemeSaveAlert() {
  const { error } = useTheme()
  return error === undefined ? null : (
    <Callout tone="danger">{defaultThemeModeLabels.error}</Callout>
  )
}

<ThemeProvider source={themeSource} initialTheme={serverTheme}>
  <ThemeModeMenu icons={{ light: <Sun />, dark: <Moon />, system: <Monitor /> }} />
  <ThemeSaveAlert />
  <ThemeModeGroup announceError={false} />
</ThemeProvider>
```

## Error boundaries

`ErrorState` is also the fallback for `@plainworks/app`'s error boundary. Wire the boundary's `reset` to `onRetry`; reporting stays in the boundary.

```tsx
<AppErrorBoundary
  fallback={({ reset }) => <ErrorState title="Something went wrong" onRetry={reset} />}
>
  {children}
</AppErrorBoundary>
```

## Relationship to `@plainworks/elements`

`ui` (L3) depends downward on `elements` (L2): the authored composites under `src/client` compose atoms and carry the accessibility, responsive, and axe-test acceptance bar. `elements` atoms are **vendored** and **locked** by `shadcn.lock.json`, so never edit one. A reusable tone or behavior goes in a `ui` wrapper here; color, contrast, and focus go in `@plainworks/theme`; a one-off goes at the call site (the **deviation ladder**). Atoms come from `@plainworks/elements/*`; composites come from `@plainworks/ui/*`.

A `ui` component exists only when it adds real behavior over an atom:

| `ui` component | Atom | Why it exists |
| --- | --- | --- |
| `Modal` | `dialog` | Always labelled; controlled open state |
| `Drawer` | `sheet` | Always labelled; the mobile home for filters and details |
| `Breadcrumbs` | `breadcrumb` | Builds the trail and current page from data |
| `Pagination` | `pagination` | Computes the page range from `std/list` |
| `Field` and `*Field` | `field` | Wires label, description, and errors to form state |
| `LoadingState`, `EmptyState`, `ErrorState` | `skeleton`, `empty` | One shape per region state, with status and recovery |

Use the atom directly for everything else, such as a popover.
