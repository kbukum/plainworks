import { Alert, AlertAction, AlertDescription, AlertTitle } from "@plainworks/elements/alert"
import { Button } from "@plainworks/elements/button"
import { Progress, ProgressLabel, ProgressValue } from "@plainworks/elements/progress"
import { Skeleton } from "@plainworks/elements/skeleton"
import { InfoIcon } from "lucide-react"
import type { ReactElement } from "react"
import { toast } from "sonner"
import { Category, Section } from "./frame"

export function FeedbackGroup(): ReactElement {
  return (
    <Category title="Feedback">
      <Section name="Alert">
        <Alert className="max-w-md">
          <InfoIcon />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Your profile was updated.</AlertDescription>
        </Alert>
        <Alert variant="destructive" className="max-w-md">
          <InfoIcon />
          <AlertTitle>Payment failed</AlertTitle>
          <AlertDescription>Your card was declined.</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline">
              Retry
            </Button>
          </AlertAction>
        </Alert>
      </Section>
      <Section name="Progress">
        <Progress value={60} className="w-64">
          <ProgressLabel>Upload</ProgressLabel>
          <ProgressValue />
        </Progress>
        <Progress value={0} aria-label="Empty progress" className="w-64" />
        <Progress value={100} aria-label="Complete progress" className="w-64" />
      </Section>
      <Section name="Skeleton">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </Section>
      <Section name="Sonner">
        <Button
          variant="outline"
          onClick={() => {
            toast("Event created")
            toast.success("Order saved")
            toast.error("Payment failed")
            toast.info("New version available")
            toast.warning("Storage almost full")
          }}
        >
          Show toast
        </Button>
      </Section>
    </Category>
  )
}
