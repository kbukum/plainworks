"use client"

// Re-export-only barrel for the client bootstrap: the root component, its capabilities, and the
// state sources they read.
export { buildClientCapabilities } from "./capabilities"
export { createMotionSource } from "./motion-preference"
export { Showcase } from "./showcase"
export { createThemeSource } from "./sources"
