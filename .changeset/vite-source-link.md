---
"@plainworks/vite": minor
"@plainworks/theme": minor
"@plainworks/elements": minor
"@plainworks/ui": minor
---

Add `@plainworks/vite`: `plainworksSource()` links an app's `@plainworks/*` imports to a local checkout's source in the Vite dev server and Vitest, with the kit's peers resolved once. Kit stylesheets now scan `src` as well as `dist`, and copied stylesheets resolve to their source file under the source condition; published manifests are unchanged.
