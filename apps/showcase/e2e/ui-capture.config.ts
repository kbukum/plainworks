import type { UiCaptureConfig } from "@plainworks/testkit/browser"
import { SHOWCASE_FLOWS } from "./flows/suite"
import { SHOWCASE_HOST } from "./support/host"
import { signIn } from "./support/session"
import { SHOWCASE_THEME_AXES } from "./support/theme-axes"

/** Where flow runs, snapshots, and bases land, relative to the showcase. Gitignored. */
export const UI_ARTIFACTS = ".ui-artifacts"

/** The showcase's `ui:capture`. */
export const SHOWCASE_UI_CAPTURE: UiCaptureConfig = {
  app: "@plainworks/showcase",
  appDir: "apps/showcase",
  root: UI_ARTIFACTS,
  // Committed; `ui:capture --docs` rewrites it from the checkpoints marked `docs`.
  docsDir: "docs/images",
  spec: "e2e/flows.spec.ts",
  flows: SHOWCASE_FLOWS,
  axes: SHOWCASE_THEME_AXES,
  host: SHOWCASE_HOST,
  warmPort: 5190,
  signIn,
  // Files that cannot change what a page shows. Anything else no flow covers runs every flow.
  ignore: [
    "**/*.md",
    "**/*.test.{ts,tsx}",
    "**/*.spec.ts",
    ".changeset/**",
    ".github/**",
    "docs/**",
    "apps/showcase/docs/**",
  ],
}
