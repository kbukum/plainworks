# @plainworks/theme

The host-independent **design substrate** the whole plainworks UI family renders against — tokens, color schemes, the theme runtime, and the `cn` class merger — with **no** atoms, Base UI, or icons pulled in.

## Install

```bash
bun add @plainworks/theme
```

Pick one stylesheet, depending on your build:

| Your build | Import | You get |
| --- | --- | --- |
| Tailwind v4 | `@import "@plainworks/theme/styles.css";` | Tokens, base rules, and utilities such as `bg-success`, `h-control`, `shadow-overlay`, and `z-toast`. |
| Plain CSS (no Tailwind) | `@import "@plainworks/theme/tokens.css";` or a `<link>` | Tokens and base rules only. Style with `var(--pw-*)`. |

With Tailwind, `tailwindcss` is an optional peer: your build compiles the stylesheet. If you also use `@plainworks/elements` or `@plainworks/ui`, import only the highest layer's `styles.css`. Each one imports the layer below and registers its own `dist/` as a Tailwind `@source`:

```css
@import "@plainworks/ui/styles.css"; /* theme + elements + ui */
```

## Tokens

Components style against **semantic tokens**, never raw palette values. A token is a `--pw-<name>` custom property, so light and dark mode (`.dark`), color schemes (`.theme-*`), and density (`data-density`) all swap by class or attribute with no JS.

| Family | Tokens | Tailwind utility |
| --- | --- | --- |
| Color | `background`, `card`, `primary`, `muted-foreground`, `border`, `input`, `ring` (focus), … | `bg-card`, `text-muted-foreground` |
| Status | `info`, `success`, `warning`, `destructive`, each with `-foreground` | `bg-success`, `text-warning` |
| Type | `text-caption` → `text-display`, `font-sans`, `font-mono` | `text-heading`, `font-mono` |
| Density | `space-control`, `space-stack`, `space-inset`, `space-section` | `h-control`, `gap-stack`, `p-inset` |
| Shape | `radius`, `shadow-raised`, `shadow-overlay` | `rounded-lg`, `shadow-overlay` |
| Focus | `ring`, `focus-width`, `focus-offset` | built into the base `:focus-visible` rule |
| Motion | `duration-fast/base/slow`, `ease-standard/enter/exit` | `transition`, `duration-fast`, `ease-enter` |
| Stacking | `z-sticky`, `z-overlay`, `z-popover`, `z-toast` | `z-overlay` |

The same names are exported as typed lists (`SEMANTIC_COLOR_ROLES`, `STATUS_TONES`, `STACKING_LAYERS`, …). Use `themeVar` for inline styles:

```ts
import { themeVar } from "@plainworks/theme"

themeVar("z-toast") // "var(--pw-z-toast)"
```

What you get by default:

- **Accessible colors.** Every text pairing meets WCAG 2.2 AA (4.5:1). Input borders and the focus ring meet 3:1. This holds in light and dark mode, for all nine color schemes, and under `prefers-contrast: more`, which strengthens borders and secondary text.
- **Safe base rules.** A bare `border` uses the `border` token, not the text color. The body uses the background, foreground, and sans font. Every `:focus-visible` element gets a visible outline. Base rules sit in the `base` cascade layer, so your own styles win.
- **Reduced motion.** When the user prefers reduced motion, all durations become `0ms`.
- **Status needs more than color.** Status tones are readable, but pair them with text or an icon so color is never the only signal.

## What's inside

| Concern | Entry | Notes |
| --- | --- | --- |
| Token contract | `@plainworks/theme` | Typed token lists and `themeVar`. |
| 9 color schemes + dark mode | `@plainworks/theme` | `COLOR_SCHEMES`; swapped by class, no JS. |
| resolve → hydrate runtime | `@plainworks/theme` (neutral) + `@plainworks/theme/client` | `resolveTheme` / `parseThemeCookie` run anywhere; `ThemeProvider` / `useTheme` are `"use client"`. |
| `cn` class merger | `@plainworks/theme` | `clsx` + `tailwind-merge`. |
| Stylesheets | `@plainworks/theme/styles.css`, `@plainworks/theme/tokens.css` | Tailwind entry, or plain CSS tokens for any host. |

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
