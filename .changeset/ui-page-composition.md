---
"@plainworks/ui": minor
---

Compose whole pages and async regions from `ui`.

- New `@plainworks/ui/page`: `Page`, `PageHeader`, `Section`, and `Toolbar` give pages one heading order, width, and spacing, and adapt to their container.
- New region states in `@plainworks/ui/feedback`: `LoadingState`, `EmptyState`, `ErrorState`, and `AsyncState`, so every region shows exactly one state and errors always offer a recovery control. `asyncStatus` picks the state and ships from the server-safe `@plainworks/ui` entry.
- `DataTable` moves low-priority columns into a per-row details disclosure on narrow containers, so no value is lost, and long values wrap instead of widening the table. New `nowrap`, `showCaption`, and `empty` props.
- `FilterBar` stacks controls when narrow, announces how many filters apply, adds **Clear all**, and keeps keyboard focus in place when rows are added or removed.

Breaking:

- `DataTable` captions are now visually hidden (still the table's accessible name). Pass `showCaption` to keep one on screen.
- `DataTable` rows are named with `getRowLabel` (replaces `getRowAriaLabel`). `labels.selectRow` is now a function of that row label, not a string or a function of the row id; the new `labels.row` names rows that have no `getRowLabel`.
- `DataTableLabels` adds required `details` and `rowDetails` fields, while `FilterBarLabels` adds required `applied` and `clearAll` fields. The component `labels` props still accept partial overrides.
- Removed `SkeletonText` (use `LoadingState`), `ErrorFallback` and the `./error-fallback` subpath (use `ErrorState`), and `PopoverPanel` (use the `popover` atom).
