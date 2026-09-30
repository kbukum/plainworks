// Re-export-only barrel for the SSR hydration concern: the one writer and reader of the data a
// server render hands to the client. Neutral: no React or DOM.
export type { HydrationDocument, HydrationPayload, HydrationScriptOptions } from "./script"
export { HYDRATION_SCRIPT_ID, readHydration, renderHydrationScript } from "./script"
