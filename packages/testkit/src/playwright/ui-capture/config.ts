import type { Page } from "@playwright/test"
import type { Flow } from "../flow/definition"
import type { ThemeAxes } from "../flow/matrix/axes"
import type { RetentionPolicy } from "../flow/report/retention"
import type { BrowserGateHost } from "../host"

/** One app's `ui:capture`: its flows, its host, and where its artifacts go. */
export interface UiCaptureConfig {
  /** The app's workspace package name, such as `@plainworks/showcase`. */
  readonly app: string
  /** The app's directory, relative to the repository root, such as `apps/showcase`. */
  readonly appDir: string
  /** The artifact root, relative to the app directory. Keep it out of version control. */
  readonly root: string
  /**
   * Where `ui:capture --docs` publishes the docs images the flows mark, relative to the app
   * directory, such as `docs/images`. The command owns the PNGs in it: each refresh writes the
   * marked set and deletes any other PNG. Commit the folder.
   */
  readonly docsDir?: string
  /** The Playwright spec that runs the flows, relative to the app directory. */
  readonly spec: string
  readonly flows: readonly Flow[]
  /** The host's theme vocabulary. Defaults to light and dark only. */
  readonly axes?: ThemeAxes
  /** How to start the app's host. A base commit's host starts the same way from its worktree. */
  readonly host: BrowserGateHost
  /** The port a warm host (`ui:capture serve`) listens on. A capture reuses a host found there. */
  readonly warmPort: number
  /** Signs a page in, so a warm host hands Playwright MCP a signed-in state. */
  readonly signIn?: (page: Page) => Promise<void>
  /** Globs of changed files that cannot change what a page shows, such as docs and unit tests. */
  readonly ignore?: readonly string[]
  /** The ref `--affected` counts changes from, by merge-base. Defaults to `origin/main`. */
  readonly affectedBase?: string
  readonly retention?: RetentionPolicy
  /** How many captured git bases to keep. Defaults to 3. */
  readonly keepBases?: number
}
