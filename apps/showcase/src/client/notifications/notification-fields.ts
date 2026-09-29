import type { Notification } from "@plainworks/demo"
import type { StatusTone } from "@plainworks/ui/display/status-badge"
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from "lucide-react"

/** Presentation for one notification type: its icon, its accessible type label, and a badge tone. */
export interface NotificationTypeMeta {
  readonly icon: LucideIcon
  readonly label: string
  readonly tone: StatusTone
}

/**
 * The per-type presentation vocabulary — the icon and the human-readable label that carries the
 * type (never colour alone), plus the badge tone. Shared by the feed item and any type badge so
 * the vocabulary lives in one place.
 */
export const NOTIFICATION_TYPE_META: Record<Notification["type"], NotificationTypeMeta> = {
  info: { icon: Info, label: "Info", tone: "info" },
  success: { icon: CircleCheck, label: "Success", tone: "success" },
  warning: { icon: TriangleAlert, label: "Warning", tone: "warning" },
  error: { icon: CircleAlert, label: "Error", tone: "danger" },
}
