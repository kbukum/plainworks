import { testConfig } from "@plainworks/vitest-config"

// `events/sink.ts` declares types only; it erases at build and has no runtime to measure.
export default testConfig({ coverage: { exclude: ["src/events/sink.ts"] } })
