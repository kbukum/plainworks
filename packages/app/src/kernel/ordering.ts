import { AppConfigError } from "../errors"

/**
 * The minimal shape {@link orderCapabilities} sorts by: a unique `id` and the ids it mounts inside.
 * `dependsOn` lives on the **client provider** half of a capability because ordering is a
 * provider-nesting concern (a dependency's provider must wrap its dependents); the neutral server
 * resolver needs no order, as resolvers run concurrently.
 */
export interface OrderedNode {
  readonly id: string
  readonly dependsOn?: readonly string[]
}

/**
 * Order a provider registry for mounting by its **declared dependencies** rather than a magic
 * number. Each entry names the ids it {@link OrderedNode.dependsOn}, and a deterministic
 * topological sort places every dependency *before* the entries that declare it — so a dependency
 * mounts **outermost** (lower index = the outer wrapper the composition folds from), where its
 * dependents can consume it. Independent entries keep their registration order, and ties among
 * newly-unblocked entries break by registration index, so the result is fully deterministic.
 *
 * The malformed-registry cases fail fast with a typed {@link AppConfigError} — before any render,
 * never a silent drop or a nondeterministic tree:
 * - a **duplicate id** (ordering and snapshot lookup would be ambiguous),
 * - a dependency on an **unknown id** (a wiring typo), and
 * - a **cycle** (including a self-dependency), which has no valid mount order.
 */
export function orderCapabilities<C extends OrderedNode>(capabilities: readonly C[]): readonly C[] {
  assertUniqueIds(capabilities)
  const nodes = capabilities.map((capability, index) => ({ capability, index, unmet: 0 }))
  const nodeById = new Map(nodes.map((node) => [node.capability.id, node]))
  // For each id, the nodes that depend on it — decremented as it is emitted (edge dep → dependent).
  const dependents = new Map<string, (typeof nodes)[number][]>()
  for (const node of nodes) {
    for (const dependencyId of node.capability.dependsOn ?? []) {
      const dependency = nodeById.get(dependencyId)
      if (dependency === undefined) {
        throw new AppConfigError(
          `Capability "${node.capability.id}" depends on unknown capability "${dependencyId}".`,
        )
      }
      node.unmet += 1
      const list = dependents.get(dependencyId) ?? []
      list.push(node)
      dependents.set(dependencyId, list)
    }
  }

  const ready = nodes.filter((node) => node.unmet === 0).sort((a, b) => a.index - b.index)
  const ordered: C[] = []
  while (ready.length > 0) {
    const node = ready.shift()
    if (node === undefined) {
      break
    }
    ordered.push(node.capability)
    for (const dependent of dependents.get(node.capability.id) ?? []) {
      dependent.unmet -= 1
      if (dependent.unmet === 0) {
        insertByIndex(ready, dependent)
      }
    }
  }

  if (ordered.length !== nodes.length) {
    const blocked = nodes.filter((node) => node.unmet > 0)
    const cyclic = cycleParticipants(blocked)
    throw new AppConfigError(
      `Cyclic capability dependencies among: ${cyclic.join(", ")}. A capability cannot (transitively) depend on itself.`,
    )
  }
  return ordered
}

/**
 * From the nodes a stalled sort left blocked, keep only the ones that actually sit **on** a cycle —
 * not the ones merely stranded behind it. A node is on a cycle iff, following only edges among
 * blocked nodes, it is reachable from itself. With `a → b → a` and a `c → b` that only depends on
 * the pair, `c` is blocked but not cyclic, so the diagnostic names `a, b` and does not misdirect
 * the fix toward `c`.
 */
function cycleParticipants(blocked: readonly { readonly capability: OrderedNode }[]): string[] {
  const blockedIds = new Set(blocked.map((node) => node.capability.id))
  const byId = new Map(blocked.map((node) => [node.capability.id, node]))
  const blockedDependencies = (id: string): readonly string[] =>
    (byId.get(id)?.capability.dependsOn ?? []).filter((dependencyId) =>
      blockedIds.has(dependencyId),
    )
  const reachesSelf = (start: string): boolean => {
    const stack = [...blockedDependencies(start)]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined) {
        break
      }
      if (id === start) {
        return true
      }
      if (seen.has(id)) {
        continue
      }
      seen.add(id)
      stack.push(...blockedDependencies(id))
    }
    return false
  }
  return blocked.filter((node) => reachesSelf(node.capability.id)).map((node) => node.capability.id)
}

/** Insert a newly-unblocked node keeping `ready` sorted by registration index (stable tie-break). */
function insertByIndex<N extends { readonly index: number }>(ready: N[], node: N): void {
  const at = ready.findIndex((candidate) => candidate.index > node.index)
  if (at === -1) {
    ready.push(node)
  } else {
    ready.splice(at, 0, node)
  }
}

/** Reject a registry with a duplicate id — the shared guard for ordering and app assembly. */
export function assertUniqueIds(capabilities: readonly { readonly id: string }[]): void {
  const seen = new Set<string>()
  for (const { id } of capabilities) {
    if (seen.has(id)) {
      throw new AppConfigError(
        `Duplicate capability id "${id}": every capability must have a unique id.`,
      )
    }
    seen.add(id)
  }
}
