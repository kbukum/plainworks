// The single named-identity rule shared by the client authorization gates and the server mutation
// boundary. The demo user carries a `name` claim; a guest does not. Keeping the rule in one neutral
// (server-safe) module means the client `<Can>` affordance and the server-side authorizer can never
// drift on who may manage their account, tasks, or orders.

/** Whether a claim value is a non-empty name — the rule behind every "manage" affordance. */
export function hasName(value: unknown): boolean {
  return typeof value === "string" && value.length > 0
}
