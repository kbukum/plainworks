// The reusable pieces the `create-plainworks` bin composes. The executable itself lives in
// `bin.ts` (the module with the top-level side effect); this barrel re-exports only, so the
// scaffold building blocks can be imported and tested without running the CLI.

export * from "./cli/options"
export * from "./scaffold/finalize"
export * from "./scaffold/generate"
export * from "./versions"
