// PostCSS pipeline for the Next host: Tailwind v4 compiles the kit's design-system stylesheets
// (`@plainworks/theme` and `@plainworks/ui`) the app composes in `globals.css`. The Next SPA/Vite
// showcase uses the Tailwind Vite plugin; a Next host reaches for the PostCSS plugin instead — same
// sources, different host build.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
