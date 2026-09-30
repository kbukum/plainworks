// Re-export-only barrel for the theme recipe: the neutral resolver a server runs and the client
// capabilities that keep color scheme and motion. The client half carries its own "use client"
// directive, so a server module can import the resolver from here.
export type { MotionCapabilityOptions, MotionState, ThemeCapabilityOptions } from "./provider"
export { createMotionCapability, createThemeCapability, useMotion } from "./provider"
export type { ThemeResolverOptions } from "./resolver"
export { createThemeResolver, THEME_CAPABILITY_ID } from "./resolver"
