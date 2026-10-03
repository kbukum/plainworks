# `@plainworks/ui`

Plainworks-authored composites built on the vendored atom set. Each component and hook has its own subpath, so a route imports only what it renders. The neutral entry holds `asyncStatus`, which runs anywhere, including on the server. The raw shadcn/Base-UI atoms live in [`@plainworks/elements`](../elements/README.md); `ui` composes them.

## Quickstart

Add both `@plainworks/ui` and `@plainworks/elements` to your app's dependencies. Atoms are imported straight from `@plainworks/elements`, and a strict package manager (pnpm, Yarn PnP) will not resolve it through `ui`'s transitive graph.

Import the stylesheet once — it pulls in `@plainworks/elements` and the `@plainworks/theme` substrate and registers the shipped composites as a Tailwind `@source`:

```css
@import "@plainworks/ui/styles.css";
```

Then import atoms from `@plainworks/elements` and composites from `@plainworks/ui`:

```tsx
import { Button } from "@plainworks/elements/button"
import { ThemeProvider } from "@plainworks/theme/client"
import { ThemeModeMenu } from "@plainworks/ui/theme/theme-mode-menu"

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

`ThemeSaveAlert` is your own small component that announces a failed save; see [Theme](#theme). The tokens, color schemes, stylesheet, and `ThemeProvider` come from [`@plainworks/theme`](../theme/README.md); `@plainworks/ui` adds ready-made color-mode controls.

## Components

Every component has its own subpath, `@plainworks/ui/<concern>/<component>`, so a route pulls in only what it renders. Each one is accessible and responsive by default and carries an axe test.

| Concern | Subpaths | You get |
| --- | --- | --- |
| `shell` | `app-shell`, `account-menu` | The app frame (header, navigation rail or drawer, skip link, main landmark) and the signed-in user's menu |
| `actions` | `icon-button` | An icon-only button that always has a name and a tooltip |
| `command` | `command-palette` | A ⌘K / Ctrl+K palette of navigation and actions |
| `layout` | `page`, `page-header`, `section`, `toolbar`, `stack`, `grid`, `split` | Page structure plus fluid, container-first layout primitives |
| `feedback` | `async-state`, `loading-state`, `empty-state`, `error-state`, `spinner`, `callout`, `toast` | Region states, inline status, and toasts |
| `display` | `date-value`, `number-value`, `status-badge`, `description-list`, `metric-card`, `sparkline` | SSR-stable `Intl` formatting, status labels, term/value lists, metric cards, and a dependency-free sparkline |
| `navigation` | `breadcrumbs`, `nav-list` | An accessible trail and a primary nav list that marks the current page |
| `overlays` | `modal`, `drawer` | Labelled, controllable overlays; a drawer body scrolls on its own |
| `forms` | `form`, `form-submit`, `text-field`, `number-field`, `date-field`, `textarea-field`, `select-field`, `checkbox-field`, `switch-field`, `radio-group-field`, `field` | Schema-validated forms on React 19 Actions |
| `data` | `data-table`, `filter-bar`, `pagination`, `list-layout`, `list-search`, `facet-panel`, `range-filter`, `use-list-query-state`, `filter-model` | A controlled table, paging, and filtering over `std/list`, plus a full list-page layout |
| `theme` | `theme-mode-menu`, `theme-mode-group`, `theme-mode-options`, `accent-picker`, `motion-control`, `theme-preview`, `theme-studio` | Color-mode, accent, and motion controls, plus a full appearance editor |
| `state` | `use-controllable-state`, `use-selection`, `use-disclosure`, `use-list-state` | DOM-free controlled/uncontrolled state hooks |
| `clipboard` | `use-clipboard` | Copy text with a timed "copied" state |
| `keyboard` | `use-keyboard-shortcuts` | Global shortcuts; `mod` means ⌘ or Ctrl |
| `media` | `use-media-query` | An SSR-safe media query |

`AppShell` frames the whole app. Navigation sits in a rail on wide screens and in a drawer behind a menu button on narrow ones, measured by the shell's own width. It adds a skip link and a named main landmark, and moves focus to main when the page changes. The rail and drawer copies of the navigation can both be mounted, so give each a unique label based on `placement`. Pass `renderLink` to `NavList` to use your router's link.

```tsx
import { NavList } from "@plainworks/ui/navigation/nav-list"
import { AppShell } from "@plainworks/ui/shell/app-shell"

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
import { Page } from "@plainworks/ui/layout/page"
import { PageHeader } from "@plainworks/ui/layout/page-header"
import { Section } from "@plainworks/ui/layout/section"
import { Toolbar } from "@plainworks/ui/layout/toolbar"

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
import { AsyncState } from "@plainworks/ui/feedback/async-state"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { ErrorState } from "@plainworks/ui/feedback/error-state"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"

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
import { DataTable } from "@plainworks/ui/data/data-table"

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

Actions may return or throw `RemoteFailure`. Field violations and request-level errors render without clearing entered values; operational failures use the summary. `onFailure` connects to the app's shared handler. For generated protobuf requests, pass [`createProtobufForm`](../connect/README.md#protobuf-forms) as the schema: it runs real Protovalidate and translates server paths through the descriptor. `ui` depends only on the lower `FormSchema` seam, not the validator library.

```tsx
import { Form } from "@plainworks/ui/forms/form"
import { FormSubmit } from "@plainworks/ui/forms/form-submit"
import { TextField } from "@plainworks/ui/forms/text-field"

<Form schema={signInSchema} onSubmit={signIn}>
  <TextField name="email" label="Email" />
  <TextField name="password" label="Password" type="password" />
  <FormSubmit>Sign in</FormSubmit>
</Form>
```

`Pagination` and `FilterBar` are controlled: they emit the same `std/list` request shape your query already holds, so paging and filtering key the cache and hit the backend with one contract. `FilterBar` stacks its controls when narrow, announces how many filters apply, offers **Clear all**, and keeps keyboard focus in place as rows come and go.

```tsx
import { FilterBar } from "@plainworks/ui/data/filter-bar"
import { Pagination } from "@plainworks/ui/data/pagination"

<FilterBar
  fields={[{ field: "status", label: "Status", type: "select", options: statusOptions }]}
  value={filters}
  onChange={setFilters}
/>
<Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
```

For a full list page, `useListQueryState` holds the page, search, sort, and filters and hands you the `std/list` params for your query. `ListLayout` puts search above the rows and filters in a side panel, which becomes a drawer on narrow screens. `FacetPanel` and `RangeFilter` edit the same filter list as `FilterBar`.

```tsx
import { FacetPanel } from "@plainworks/ui/data/facet-panel"
import { ListLayout } from "@plainworks/ui/data/list-layout"
import { ListSearch } from "@plainworks/ui/data/list-search"
import { useListQueryState } from "@plainworks/ui/data/use-list-query-state"

const list = useListQueryState({ pageSize: 20, facets: ["status"] })
const orders = useOrders(list.params)

<ListLayout
  search={<ListSearch value={list.search} onChange={list.setSearch} />}
  filters={<FacetPanel fields={facetFields} facets={orders.facets} value={list.filters} onChange={list.setFilters} />}
  activeFilters={list.filters.length}
>
  {table}
</ListLayout>
```

`CommandPalette` opens from its trigger or ⌘K / Ctrl+K. Give it groups of items; it closes before it runs the one you pick.

```tsx
import { CommandPalette } from "@plainworks/ui/command/command-palette"

<CommandPalette
  groups={[{ id: "go", heading: "Go to", items: [{ id: "orders", label: "Orders", onSelect: openOrders }] }]}
/>
```

## State and browser hooks

The DOM-free `state` hooks (`useControllableState`, `useSelection`, `useDisclosure`, `useListState`) are the controlled/uncontrolled base the composites build on. Browser capabilities each have their own concern: `clipboard`, `keyboard`, and `media`. They wrap DOM APIs with SSR-safe defaults and clean up after themselves.

```tsx
import { useClipboard } from "@plainworks/ui/clipboard/use-clipboard"
import { useSelection } from "@plainworks/ui/state/use-selection"
```

## Theme

Use `parseThemeCookie` and `resolveTheme` from `@plainworks/theme/preference` during SSR, then render the returned `htmlClass` on `<html>`. System mode adds no mode class, so the stylesheet follows the OS preference on the first paint. On the client, pass a caller-owned `StateSource<ThemePreference>` to `ThemeProvider` from `@plainworks/theme/client`; `cookieScope` from `@plainworks/state/cookie` keeps the value server-readable without creating a singleton or using browser storage directly.

`ThemeStudio` is a ready-made appearance editor: color mode, accent color, and a live preview. Add `MotionControl` with `useDocumentMotion` from `@plainworks/theme/client` to let users reduce motion.

Two smaller controls set the color mode. `ThemeModeMenu` is a compact header menu; `ThemeModeGroup` is an inline Light / Dark / System button group for a settings page. Both take optional `icons` and `labels`, so the kit ships no icon set and no fixed copy.

A save can fail, for example when the cookie write is rejected. The selection then stays unchanged and the failure lands on `useTheme().error`:

- `ThemeModeGroup` announces it below itself. Pass `announceError={false}` when the page already does.
- `ThemeModeMenu` has no room for an inline message. **Render one app-level alert yourself**, or the failure is silent.

```tsx
import { ThemeProvider, useTheme } from "@plainworks/theme/client"
import { Callout } from "@plainworks/ui/feedback/callout"
import { ThemeModeGroup } from "@plainworks/ui/theme/theme-mode-group"
import { ThemeModeMenu } from "@plainworks/ui/theme/theme-mode-menu"
import { defaultThemeModeLabels } from "@plainworks/ui/theme/theme-mode-options"

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

`ui` (L3) depends downward on `elements` (L2): the authored composites under `src/client` compose atoms and carry the accessibility, responsive, and axe-test acceptance bar. `elements` atoms are **vendored** and **locked** by `shadcn.lock.json`, so never edit one. A reusable tone or behavior goes in a `ui` wrapper here; color, contrast, and focus go in `@plainworks/theme`; a one-off goes at the call site (the **deviation ladder**). Atoms come from atom subpaths such as `@plainworks/elements/button`; composites come from composite subpaths such as `@plainworks/ui/feedback/error-state`.

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
