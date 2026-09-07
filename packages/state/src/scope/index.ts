// Re-export-only barrel for the neutral (server-safe) scope surface — no logic here. These pieces
// carry no host access, so they live in the `.` entry: the scope contract, the memory scope, and the
// serializers a host-backed scope composes in.
export { memoryScope } from "./memory"
export type { Scope, SourceSpec } from "./scope"
export { jsonSerializer, stringSerializer } from "./serializer"
