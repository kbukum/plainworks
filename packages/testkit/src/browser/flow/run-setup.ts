import {
  type ArtifactStore,
  collectFlowRun,
  FLOW_RUN_ENV,
  nodeArtifactStore,
  publishFlowRun,
  startFlowRun,
} from "./report/artifacts"
import type { RetentionPolicy } from "./report/retention"

/** Options for {@link setupFlowRun}. */
export interface SetupFlowRunOptions {
  /** The artifact root, such as `.ui-artifacts`. Keep it out of version control. */
  readonly root: string
  readonly retention?: RetentionPolicy
  /** Where the run directory is published to the workers. Defaults to `process.env`. */
  readonly env?: Record<string, string | undefined>
  readonly store?: ArtifactStore
}

/**
 * Start a run for one Playwright invocation, from its `globalSetup`. It publishes the run
 * directory to the workers, and returns the teardown Playwright calls once every test finished:
 * that merges the run's entries into `report.json` and `report.md`, points `<root>/latest` at the
 * run, and prunes old runs. A run no flow wrote to, such as one of only other specs, is removed.
 *
 * When the environment already names a run directory, a caller such as `ui:capture` owns the run
 * and finishes it itself, so this starts nothing and the teardown does nothing.
 */
export async function setupFlowRun(options: SetupFlowRunOptions): Promise<() => Promise<void>> {
  const env = options.env ?? process.env
  const owned = env[FLOW_RUN_ENV]
  if (owned !== undefined && owned !== "") return async () => {}
  const store = options.store ?? nodeArtifactStore
  const run = await startFlowRun({ root: options.root, store })
  env[FLOW_RUN_ENV] = run.dir
  return async () => {
    const report = await collectFlowRun({ run, store })
    if (report.runs.length === 0) {
      await store.remove(run.dir)
      return
    }
    await publishFlowRun({
      root: options.root,
      run,
      report,
      store,
      ...(options.retention === undefined ? {} : { retention: options.retention }),
    })
  }
}
