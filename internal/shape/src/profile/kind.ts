/**
 * The profile a workspace follows:
 *
 * - `package`: a library with a tsdown `build` of entry points (published, or private under
 *   `internal/`).
 * - `cli`: a published command with a tsdown `build` of bins.
 * - `tool`: a dev-only workspace under `internal/`, run from source.
 * - `app`: a host under `apps/`, or a suite that uses the built packages the way an app does.
 */
export type WorkspaceKind = "package" | "cli" | "tool" | "app"

// Workspaces outside `apps/` that must prove the built surface, not the source: the cross-package
// suite imports each package the way an installed consumer does.
const BUILT_SURFACE_SUITES: readonly string[] = ["internal/integration"]

/**
 * Infers a workspace's kind from where it lives and whether it has a tsdown build. A built
 * workspace is `package` here; its build then says whether it is a `cli` instead.
 */
export function inferKind(dir: string, hasBuild: boolean): Exclude<WorkspaceKind, "cli"> {
  if (dir.startsWith("apps/") || BUILT_SURFACE_SUITES.includes(dir)) return "app"
  if (dir.startsWith("packages/") || hasBuild) return "package"
  return "tool"
}
