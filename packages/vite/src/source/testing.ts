import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

/** A temp folder tree written from a `path → contents` map; JSON values are serialized. */
export interface FixtureTree {
  readonly root: string
  remove(): void
}

export function writeTree(files: Readonly<Record<string, unknown>>): FixtureTree {
  const root = mkdtempSync(join(tmpdir(), "plainworks-vite-"))
  for (const [path, contents] of Object.entries(files)) {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents))
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) }
}

/** A two-package kit checkout: `ui` (source entries, a copied and a vendored asset) on `std`. */
export const KIT_FILES: Readonly<Record<string, unknown>> = {
  "kit/packages/std/package.json": {
    name: "@plainworks/std",
    version: "0.2.0",
    exports: { ".": { "@plainworks/source": "./src/index.ts", default: "./dist/index.js" } },
  },
  "kit/packages/std/src/index.ts": "export const std = 'source'\n",
  "kit/packages/ui/package.json": {
    name: "@plainworks/ui",
    version: "0.2.0",
    exports: {
      ".": { "@plainworks/source": "./src/index.ts", default: "./dist/index.js" },
      "./button": { types: "./dist/button.d.ts", default: "./dist/button.js" },
      "./styles.css": { "@plainworks/source": "./src/styles.css", default: "./dist/styles.css" },
      "./tokens.css": "./dist/tokens.css",
    },
    peerDependencies: { react: "^19", "@plainworks/std": "*", "@tanstack/react-query": "^5" },
    dependencies: { "@plainworks/std": "*", "shared-dep": "^1", "kit-only": "^1" },
  },
  "kit/packages/ui/src/index.ts": "export { std } from '@plainworks/std'\n",
  "kit/packages/notes/README.md": "not a package\n",
  "kit/packages/other/package.json": { name: "left-pad", version: "1.0.0" },
}
