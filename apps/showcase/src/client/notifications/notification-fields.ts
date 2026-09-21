import type { Notification } from "@plainworks/demo"
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from "lucide-react"

type BadgeTone = "default" | "secondary" | "destructive" | "outline"

/** Presentation for one notification type: its icon, its accessible type label, and a badge tone. */
export interface NotificationTypeMeta {
  readonly icon: LucideIcon
  readonly label: string
  readonly tone: BadgeTone
}

/**
 * The per-type presentation vocabulary — the icon and the human-readable label that carries the
 * type (never colour alone), plus the badge tone. Shared by the feed item and any type badge so
 * the vocabulary lives in one place.
 */
export const NOTIFICATION_TYPE_META: Record<Notification["type"], NotificationTypeMeta> = {
  info: { icon: Info, label: "Info", tone: "secondary" },
  success: { icon: CircleCheck, label: "Success", tone: "default" },
  warning: { icon: TriangleAlert, label: "Warning", tone: "outline" },
  error: { icon: CircleAlert, label: "Error", tone: "destructive" },
}
