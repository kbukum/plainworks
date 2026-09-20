import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// The reference host's build config. The Tailwind v4 plugin compiles the kit's design-system
// stylesheets (`@plainworks/theme` and `@plainworks/ui`) the app imports. Vite's default (oxc)
// automatic JSX runtime needs no `@vitejs/plugin-react` — Fast Refresh is not needed to prove
// assembly — and `react`/`react-dom` are deduped so a single React instance backs both the server
// and client graphs.
//
// The dev-only mock backend that serves the browser's `/api/*` calls lives in `server.ts`, not
// here: its order-write authorizer must verify session cookies under the same signing key the SSR
// host's session flow signs with, which only exists at runtime. Wiring it at config time would give
// the authorizer a different key and reject every real session.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  build: { outDir: "dist", emptyOutDir: true },
})
