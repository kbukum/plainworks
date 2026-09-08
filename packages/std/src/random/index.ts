/**
 * Random-value generation: the non-secure {@link RandomSource} stream (system and seeded, for jitter and deterministic fixtures) and the Web Crypto identifier helpers ({@link randomId}, {@link idempotencyKey}) for security-sensitive values. Kept together so a caller picks the right source by intent. Re-export-only barrel; implementation lives in the concern-named modules beside it.
 */
export { idempotencyKey, randomId } from "./id"
export type { RandomSource } from "./source"
export { createSeededRandom, systemRandom } from "./source"
