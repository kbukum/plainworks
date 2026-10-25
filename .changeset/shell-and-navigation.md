---
"@plainworks/testkit": minor
"@plainworks/theme": minor
"@plainworks/ui": minor
---

Add the pieces an app needs for a collapsible shell, keyboard help, and telling compared items apart.

- **Series colors** — eight distinct hues (`series-1` → `series-8`) plus `series-foreground`, tuned per mode and checked for contrast against every surface.
- **Display** — `ItemMarker` (a lettered badge in a series color, so color is never the only cue), `MetricValue` (tabular figures with a muted unit; a missing value reads as words, never as 0), and `Identifier` (a mono id shortened in the middle, with the full value on focus and a named copy button).
- **Page header** — `PageHeader` takes an `identifier` and link `tabs` for an object's views.
- **Shell** — the `AppShell` rail collapses to icons through a named toggle, keeps a `railFooter`, and the header is opaque. `focusOnMount` moves focus to the page when the host mounts a new shell for a navigation, such as a tenant switch. `AccountMenu` fits a rail: its name is cut short to fit, and `compact` shows only the avatar. `NavList` has a `collapsed` mode with tooltips.
- **Keyboard** — character-key shortcuts stay quiet in any field, while composing, and on repeat, follow the typed character on every layout, including punctuation typed with Option on macOS, and can be turned off (`singleKeys`). New `ShortcutHint` and `ShortcutsSheet`.
- **Picks** — `useTray` keeps a small ordered set of picks in memory or any state source, remembering an emptied tray and writing changes one at a time, newest last; a new source starts afresh and never receives the old source's writes. `SelectionBar` shows them with markers, remove buttons and actions, wraps the picks onto their own row on narrow screens, and reserves its height as page scroll padding so it never hides a focused control.
- **Command palette** — the trigger announces its shortcut through `aria-keyshortcuts`, and its key caps are no longer part of the visible text, so the visible label matches the accessible name.
- **Toasts** — a toast message can carry one `action` button; picking it runs the action and closes the toast.
- **Testkit** — `installLayoutApis` gives jsdom inert `ResizeObserver` and `scrollIntoView`, so tests can render command lists.
