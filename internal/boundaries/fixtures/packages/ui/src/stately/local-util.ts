// Fixture: a plain module inside the UNMAPPED neutral concern `stately`. It is the same-folder
// target for `local-consumer.ts` below — the fail-closed catch-all exempts a concern's OWN folder
// (`$2`), so an intra-folder import must stay legal even for an unlisted neutral concern.
export const localUtil = "local-util"
