---
"@plainworks/ui": minor
---

Drop the 47 atom re-export subpaths (`@plainworks/ui/button`, `@plainworks/ui/input`, …). `ui` owns composites; the atoms it composes live in `@plainworks/elements` and are imported straight from there. No composite or example app used the pass-throughs, so their only effect was to shadow `elements`' surface. Import atoms from `@plainworks/elements/*` and composites from `@plainworks/ui/*`.

**Migration:** add `@plainworks/elements` to your app's own dependencies — a strict package manager (pnpm, Yarn PnP) will not resolve it through `@plainworks/ui`'s transitive graph — then rewrite each `@plainworks/ui/<atom>` import to `@plainworks/elements/<atom>`.
