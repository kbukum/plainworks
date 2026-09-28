import { ReleaseToolError } from "../error"
import type { PublishableWorkspace } from "../workspace"

/**
 * Sorts the publish set so each package follows every publishable package it depends on, so a
 * consumer never sees a package whose dependencies are missing from the registry. Ties break by
 * name for a stable, reviewable order.
 *
 * @throws {ReleaseToolError} On a dependency cycle.
 */
export function orderForPublish(
  workspaces: readonly PublishableWorkspace[],
): PublishableWorkspace[] {
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const ordered: PublishableWorkspace[] = []
  const state = new Map<string, "visiting" | "done">()
  const visit = (workspace: PublishableWorkspace, trail: readonly string[]): void => {
    const status = state.get(workspace.name)
    if (status === "done") return
    if (status === "visiting") {
      throw new ReleaseToolError(`Dependency cycle: ${[...trail, workspace.name].join(" → ")}`)
    }
    state.set(workspace.name, "visiting")
    for (const dep of [...workspace.deps].sort()) {
      const target = byName.get(dep)
      if (target !== undefined) visit(target, [...trail, workspace.name])
    }
    state.set(workspace.name, "done")
    ordered.push(workspace)
  }
  for (const workspace of [...workspaces].sort((a, b) => a.name.localeCompare(b.name))) {
    visit(workspace, [])
  }
  return ordered
}

/**
 * Asserts `ordered` covers exactly `workspaces` and puts every dependency first.
 *
 * @throws {ReleaseToolError} When the set drifts or the order is invalid.
 */
export function assertPublishOrder(
  workspaces: readonly PublishableWorkspace[],
  ordered: readonly PublishableWorkspace[],
): void {
  const expected = new Set(workspaces.map((w) => w.name))
  const orderedNames = ordered.map((w) => w.name)
  const seen = new Set(orderedNames)
  const missing = [...expected].filter((name) => !seen.has(name))
  const extra = orderedNames.filter((name) => !expected.has(name))
  if (missing.length > 0 || extra.length > 0 || orderedNames.length !== expected.size) {
    const miss = missing.join(", ") || "none"
    const surplus = extra.join(", ") || "none"
    throw new ReleaseToolError(
      `Publish set does not match publishable workspaces (missing: ${miss}; extra: ${surplus}).`,
    )
  }
  const position = new Map(orderedNames.map((name, index) => [name, index]))
  for (const workspace of ordered) {
    const own = position.get(workspace.name) ?? 0
    for (const dep of workspace.deps) {
      const depPosition = position.get(dep)
      if (depPosition !== undefined && depPosition > own) {
        throw new ReleaseToolError(`${workspace.name} is published before its dependency ${dep}.`)
      }
    }
  }
}
