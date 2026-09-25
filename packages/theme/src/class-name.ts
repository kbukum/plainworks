import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { DENSITY_SPACES } from "./tokens/density"
import { ELEVATION_LEVELS } from "./tokens/elevation"
import { MOTION_DURATIONS, MOTION_EASINGS } from "./tokens/motion"
import { STACKING_LAYERS } from "./tokens/stacking"
import { TYPE_STEPS } from "./tokens/typography"

// Teach the merger the theme's token utilities. Without this, `text-heading` reads as a text
// color and `cn("text-heading text-primary")` silently drops the type step.
const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TYPE_STEPS],
      spacing: [...DENSITY_SPACES],
      shadow: [...ELEVATION_LEVELS],
      ease: [...MOTION_EASINGS],
    },
    classGroups: {
      z: [{ z: [...STACKING_LAYERS] }],
      duration: [{ duration: [...MOTION_DURATIONS] }],
    },
  },
})

/** Join class values and resolve Tailwind conflicts so the last utility in each group wins. */
export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs))
}
