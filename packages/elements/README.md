# `@plainworks/elements`

The owned shadcn/Base-UI atom set — buttons, inputs, dialogs, menus, and the rest of the ~47 primitives — installed and refreshed through the official **shadcn CLI**, never hand-copied from source. Every atom is a `"use client"` module with a per-atom subpath export, so consumers tree-shake to exactly the atoms they import.

Part of the [plainworks](../../README.md) kit.

## Quickstart

Import this package's stylesheet once — it pulls in the `@plainworks/theme` substrate and registers the shipped atoms as a Tailwind `@source` — then adopt the atoms you use:

```css
@import "@plainworks/elements/styles.css";
```

```tsx
import { Button } from "@plainworks/elements/button"
import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { Input } from "@plainworks/elements/input"

export function ProfileForm() {
  return (
    <Card aria-labelledby="profile-title">
      <CardHeader>
        <CardTitle id="profile-title">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <label htmlFor="display-name">Display name</label>
        <Input id="display-name" />
        <Button>Save</Button>
      </CardContent>
    </Card>
  )
}
```

Tokens, color schemes, and the stylesheet are owned by [`@plainworks/theme`](../theme/README.md); every atom styles against theme semantic tokens and imports `cn` from it. The neutral `.` entry ships only the server-safe `ELEMENT_NAMES` manifest — the atoms themselves are DOM behaviour and live behind their subpaths.

## The ingestion pipeline

Atoms come **from the tool, not from a source checkout**. The `registry` CLI wraps the official shadcn CLI, so `add`/`update` are reproducible without a pristine snapshot to diff against.

| Command | What it does |
|---|---|
| `registry:add <atom>` | Run `shadcn add`, apply the compat transform, format, and write an owned file. |
| `registry:update <atom>` | Re-run the pipeline against current upstream and surface a review diff to reconcile. |
| `registry:diff <atom>` | Advisory: show the delta versus current upstream (the compat delta is expected). |
| `registry:validate` | Offline check that `registry.json` is schema-correct and every declared file exists. |
| `registry:codegen` | Re-derive `registry.json`, the `exports` map, the tsdown entries, and the `.` manifest from disk. |

Run them with `bun run --filter @plainworks/elements <script>`.

The **compat transform** is the only edit the pipeline makes: it rewrites the `cn` import onto `@plainworks/theme` and guarantees a leading `"use client"` directive. Output is then Biome-formatted, so a freshly ingested atom is lint- and format-clean by construction. Atoms are **owned and editable** — deviate in an authored wrapper (in `@plainworks/ui`) rather than editing an atom in place, so `diff`/`update` stay meaningful.

## Drift-proof by codegen

`registry.json`, the package `exports`, the tsdown `entry` map, and `src/registry.ts` are all generated from the atom files on disk — nothing is hand-maintained, so nothing can silently drift from the actual atom set. A test re-derives them and asserts the committed artifacts match. After adding or removing an atom, run `registry:codegen`.

## Accessibility

Each interactive atom carries an axe assertion in the gallery test (`src/components/gallery.test.tsx`). Automation is a floor, not proof — keyboard operability, focus, and roles are still reviewed. The atoms also render under `renderToStaticMarkup`, proving the family is SSR-safe.
