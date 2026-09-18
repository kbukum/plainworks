import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { EXAMPLE_SOURCE_APPS } from "./config"
import { assertEjectable } from "./coupling"

// The standing ejectability gate over the real source apps: every host the initializer ships must
// couple to the monorepo only through the channels eject neutralizes. If a source app grows an
// un-neutralized coupling — a private/internal dependency, an import escaping the app, an
// unexpected tsconfig `extends` — this fails, keeping the coupling surface small by enforcement
// rather than hope.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const appsDir = join(repoRoot, "apps")

describe("source apps stay ejectable", () => {
  for (const [host, app] of Object.entries(EXAMPLE_SOURCE_APPS)) {
    it(`apps/${app} (host "${host}") couples only through neutralized channels`, () => {
      expect(() => assertEjectable({ appDir: join(appsDir, app), repoRoot })).not.toThrow()
    })
  }
})
