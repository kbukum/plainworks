/** The shared spacing scale for gaps between layout children (maps to theme spacing steps). */
export type Gap = "none" | "xs" | "sm" | "md" | "lg" | "xl"

/** Tailwind gap utility per {@link Gap} step, shared by every layout primitive. */
export const GAP_CLASS: Record<Gap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
}
