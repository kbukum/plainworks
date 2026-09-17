// Test stand-in for the `server-only` marker package. Its real `default` export throws on import
// to poison client bundles, but that also throws under Vitest's Node environment. Aliasing the
// import here to an empty module lets the server modules keep the enforced `import "server-only"`
// tripwire while their behavior stays unit-testable. See `vitest.config.ts`.
export {}
