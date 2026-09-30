---
"@plainworks/ui": minor
---

Every component and hook now has its own subpath, `@plainworks/ui/<concern>/<component>`, so a route bundles only what it renders.

- **Import per component.** For example, `@plainworks/ui/forms/text-field`, `@plainworks/ui/data/data-table`, and `@plainworks/ui/state/use-selection`. The `./client` entry and the per-concern aggregates (`./forms`, `./feedback`, `./page`, `./list`, …) are gone.
- **Page structure joined `layout`.** `Page`, `PageHeader`, `Section`, and `Toolbar` live under `@plainworks/ui/layout/*`. `DataTable`, `FilterBar`, and `Pagination` live under `@plainworks/ui/data/*`.
- **Theme names come from `@plainworks/theme`.** The `.` entry no longer re-exports tokens or `resolveTheme`, and `ThemeProvider`/`useTheme` come from `@plainworks/theme/client`.
