import "../../../src/client/styles.css"

import { jsonSerializer, memoryScope } from "@plainworks/state"
import { ThemeProvider } from "@plainworks/theme/client"
import type { ThemePreference } from "@plainworks/theme/preference"
import { ToastProvider } from "@plainworks/ui/feedback/toast"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { CompositesGroup } from "./composites"
import { DataGroup } from "./data"
import { DisplayGroup } from "./display"
import { FeedbackGroup } from "./feedback"
import { FormControlsGroup } from "./form-controls"
import type { GalleryGroupId } from "./groups"
import { LayoutGroup } from "./layout"
import { NavigationGroup } from "./navigation"
import { OverlaysGroup } from "./overlays"

// The browser entry for one gallery page. Every vendored atom renders exactly as shipped; the only
// styling is the app stylesheet, so a baseline moves only with a registry update or a theme change.
const GROUPS: Record<GalleryGroupId, () => ReactElement> = {
  "form-controls": FormControlsGroup,
  display: DisplayGroup,
  feedback: FeedbackGroup,
  navigation: NavigationGroup,
  overlays: OverlaysGroup,
  data: DataGroup,
  layout: LayoutGroup,
  composites: CompositesGroup,
}

function isGroupId(value: string | null): value is GalleryGroupId {
  return value !== null && Object.hasOwn(GROUPS, value)
}

const requested = new URLSearchParams(window.location.search).get("group")
if (!isGroupId(requested)) throw new Error(`Unknown gallery group: ${String(requested)}`)
const Group = GROUPS[requested]

// The system preference drives the mode, so the gate's emulated color scheme picks light or dark.
const themeSource = memoryScope.createSource<ThemePreference>({
  key: "gallery-theme",
  serializer: jsonSerializer<ThemePreference>(),
})

const container = document.getElementById("fixture")
if (container === null) throw new Error("Missing #fixture container")
createRoot(container).render(
  <ThemeProvider source={themeSource}>
    <ToastProvider limit={4}>
      <Group />
    </ToastProvider>
  </ThemeProvider>,
)
