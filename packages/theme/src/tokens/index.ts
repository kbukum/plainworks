// Re-export-only barrel for the design-token contract (no logic here). Neutral/DOM-free, so it is
// safe on the server `.` entry.
export type {
  BrandColorRole,
  RadiusStep,
  SemanticColorRole,
} from "./roles"
export {
  BRAND_COLOR_ROLES,
  colorRoleVar,
  RADIUS_STEPS,
  SEMANTIC_COLOR_ROLES,
  semanticRoleVar,
} from "./roles"
