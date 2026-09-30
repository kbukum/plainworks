---
"@plainworks/ui": minor
---

Common app UI now ships in the kit. Every composite takes its text through a `labels` prop, so you can translate or reword it.

- **Lists.** `ListLayout`, `ListSearch`, `FacetPanel`, and `RangeFilter` under `@plainworks/ui/data/*`. `useListQueryState` keeps a list's query in sync with your state. Filter helpers such as `toggleFacetValue` and `withRangeBound` come from `@plainworks/ui/data/filter-model`.
- **Display.** `MetricCard`/`MetricList`, `Sparkline`, and `DescriptionList`.
- **Actions and shell.** `IconButton` always shows its name as a tooltip. `AccountMenu` gives signed-in users a menu of your own items.
- **Command palette.** `CommandPalette` in `@plainworks/ui/command/command-palette` opens with ⌘K / Ctrl+K and runs the items you give it.
- **Forms.** `RadioGroupField` for a short list of labeled choices.
- **Theme.** `AccentPicker`, `MotionControl`, `ThemePreview`, and `ThemeStudio` let users pick color scheme, mode, and motion.
- **Feedback.** `ToastProvider` and `useToast` raise toasts built on the vendored atom. `Spinner` now draws the vendored spinner.
- **Numeric filters hold numbers.** `FilterBar` edits a number field with a number input and drops text it can't show. A non-numeric value that arrives from outside is marked invalid.
- **Hooks moved to their concern.** `@plainworks/ui/hooks/*` is gone. State hooks live under `@plainworks/ui/state/*`. Browser hooks live under `@plainworks/ui/clipboard/*`, `@plainworks/ui/keyboard/*`, and `@plainworks/ui/media/*`.
