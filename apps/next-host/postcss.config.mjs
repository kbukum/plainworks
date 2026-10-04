// PostCSS pipeline for the Next host: Tailwind v4 compiles the kit's design-system stylesheets
// (`@plainworks/theme` and `@plainworks/ui`) the app composes in `globals.css`. The Next SPA/Vite
// showcase uses the Tailwind Vite plugin; a Next host reaches for the PostCSS plugin instead — same
// sources, different host build.
import { join } from "node:path"

export default {
  plugins: {
    "@tailwindcss/postcss": {
      // Scan app sources, never runtime custody or build output, even outside a Git repository.
      base: join(process.cwd(), "src"),
    },
  },
}
