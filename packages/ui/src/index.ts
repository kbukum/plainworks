// Server-safe public entry for `@plainworks/ui` — re-export-only barrel (no logic here). No React
// or DOM imports, so the `.` entry runs anywhere (Node, edge, RSC). It holds the pure view logic
// (`asyncStatus`), so server code can pick a region's state without crossing a `"use client"`
// boundary. Components and React hooks ship one per subpath (`@plainworks/ui/<concern>/<module>`),
// and theme tokens and resolution come from `@plainworks/theme`, never here.

export type { AsyncFlags, AsyncStatus } from "./region"
export { asyncStatus } from "./region"
