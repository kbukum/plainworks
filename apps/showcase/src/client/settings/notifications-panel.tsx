"use client"

import type { UpdateSettingsInput } from "@plainworks/demo"
import { CheckboxField, Form, SwitchField } from "@plainworks/ui/forms"
import type { ReactElement } from "react"
import { useToast } from "../feedback"
import { PanelActions, type SettingsPanelProps } from "./settings-panel"
import { notificationsFormSchema } from "./settings-schema"

/**
 * The Notifications panel: the per-channel delivery switches and the profile-visibility checkboxes.
 * It exercises the kit's switch and checkbox fields — an unchecked control submits as `false`, a
 * checked one as `true`, so the saved record always reflects the visible state.
 */
export function NotificationsPanel({ settings, save }: SettingsPanelProps): ReactElement {
  const toast = useToast()
  const formKey = [
    settings.notifications.email,
    settings.notifications.push,
    settings.notifications.sms,
    settings.privacy.profileVisible,
    settings.privacy.showEmail,
  ].join(":")

  const onSubmit = async (input: UpdateSettingsInput): Promise<void> => {
    const outcome = await save(input)
    if (outcome === "success") {
      toast.success("Notification settings saved")
    } else if (outcome === "failure") {
      toast.error("Your notification settings could not be saved")
    }
  }

  return (
    <Form
      key={formKey}
      schema={notificationsFormSchema()}
      onSubmit={onSubmit}
      className="grid gap-6"
    >
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Delivery channels</legend>
        <SwitchField
          name="email"
          label="Email"
          description="Product updates and receipts by email."
          defaultChecked={settings.notifications.email}
        />
        <SwitchField
          name="push"
          label="Push"
          description="Real-time alerts on your devices."
          defaultChecked={settings.notifications.push}
        />
        <SwitchField
          name="sms"
          label="SMS"
          description="Time-sensitive alerts by text message."
          defaultChecked={settings.notifications.sms}
        />
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Profile visibility</legend>
        <CheckboxField
          name="profileVisible"
          label="Show my profile to teammates"
          defaultChecked={settings.privacy.profileVisible}
        />
        <CheckboxField
          name="showEmail"
          label="Show my email address on my profile"
          defaultChecked={settings.privacy.showEmail}
        />
      </fieldset>
      <PanelActions label="Save notifications" />
    </Form>
  )
}
