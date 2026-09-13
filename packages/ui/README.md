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

`ui` (L3) depends downward on `elements` (L2): the authored composites under `src/client` compose owned atoms and carry the accessibility, responsive, and axe-test acceptance bar. Keep any customization of an atom in a `ui` wrapper — never edit an atom in place, so the `elements` upstream `diff`/`update` stay meaningful. Consumers import atoms from `@plainworks/elements/*` and composites from `@plainworks/ui/*`.
