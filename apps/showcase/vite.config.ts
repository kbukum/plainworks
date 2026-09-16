import { createMockApi } from "@plainworks/demo"
import { mockServerPlugin } from "@plainworks/mocks/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// The reference host. In dev, `mockServerPlugin` serves `/api/*` from one isolated `createMockApi`
// graph, so the browser makes real HTTP requests to the same fixtures the SSR render and the tests
// use. The Tailwind v4 plugin compiles the kit's design-system stylesheets (`@plainworks/theme` and
// `@plainworks/ui`) the app imports. Vite's default (oxc) automatic JSX runtime needs no
// `@vitejs/plugin-react` — Fast Refresh is not needed to prove assembly — and `react`/`react-dom`
// are deduped so a single React instance backs both the server and client graphs.
export default defineConfig({
  plugins: [tailwindcss(), mockServerPlugin(createMockApi().handlers)],
  resolve: { dedupe: ["react", "react-dom"] },
  build: { outDir: "dist", emptyOutDir: true },
})
