// Vite/Vitest `?raw` imports resolve to the file's text — used by the public-surface test to emit
// and scan each concern module's isolated declaration. Ambient so `tsc` accepts the query import.
declare module "*?raw" {
  const content: string
  export default content
}
