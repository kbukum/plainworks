"use client"

// Public surface of the settings concern — re-export-only barrel, no logic. The shell's section
// outlet mounts `SettingsSection`; the panels and controls are internal to the concern.
export { SettingsSection } from "./settings-section"
