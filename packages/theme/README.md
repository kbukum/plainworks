# @plainworks/theme

The host-independent **design substrate** the whole plainworks UI family renders against — tokens, color schemes, the theme runtime, and the `cn` class merger — with **no** atoms, Base UI, or icons pulled in.

## Install

```bash
bun add @plainworks/theme
```

Import the single CSP-safe stylesheet once, at your app's style entry:

```css
@import "@plainworks/theme/styles.css";
```

The stylesheet is compiled by **your** Tailwind v4 build, so `tailwindcss` is an optional peer (declared, not bundled — a React Native consumer of the tokens alone never needs it). When you also use `@plainworks/elements` or `@plainworks/ui`, import *their* `styles.css` instead: each layer's stylesheet imports the one below and registers its own `dist/` as a Tailwind `@source`, since Tailwind never auto-detects sources inside `node_modules`. Import exactly one — the highest layer you use:

```css
@import "@plainworks/ui/styles.css"; /* theme + elements + ui */
```

## What's inside

| Concern | Entry | Notes |
| --- | --- | --- |
| Three-tier tokens + the semantic **role contract** | `@plainworks/theme` | `SEMANTIC_COLOR_ROLES`, `colorRoleVar`, `semanticRoleVar`; components style against semantic roles only. |
| 9 color schemes + dark mode | `@plainworks/theme` | `COLOR_SCHEMES`; swapped by class, no JS. |
| resolve → hydrate runtime | `@plainworks/theme` (neutral) + `@plainworks/theme/client` | `resolveTheme` / `parseThemeCookie` run anywhere; `ThemeProvider` / `useTheme` are `"use client"`. |
| `cn` class merger | `@plainworks/theme` | `clsx` + `tailwind-merge`. |
| Stylesheet | `@plainworks/theme/styles.css` | Tailwind v4 `@theme` + the Base-UI custom variants. |

## SSR-safe theming

Resolve the `<html>` attributes on the server, then own the source on the client:

```tsx
import { parseThemeCookie, resolveTheme } from "@plainworks/theme"
import { ThemeProvider } from "@plainworks/theme/client"

const preference = parseThemeCookie(request.headers.get("cookie") ?? "")
const { htmlClass, colorScheme } = resolveTheme(preference, systemPrefersDark)
// apply htmlClass/colorScheme to <html> before hydration, then:

<ThemeProvider source={themeSource} initialTheme={preference}>
  {children}
</ThemeProvider>
```

The neutral `.` entry is DOM-free (portability gate), so it runs on the server, edge, RSC, and React Native; the provider is the only DOM-touching surface and lives behind `./client`.
