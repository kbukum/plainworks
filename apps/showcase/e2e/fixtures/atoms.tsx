import "../../src/client/styles.css"

import { Alert, AlertDescription, AlertTitle } from "@plainworks/elements/alert"
import { Avatar, AvatarFallback, AvatarGroup } from "@plainworks/elements/avatar"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { Checkbox } from "@plainworks/elements/checkbox"
import { Input } from "@plainworks/elements/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@plainworks/elements/input-group"
import { Label } from "@plainworks/elements/label"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Progress } from "@plainworks/elements/progress"
import { RadioGroup, RadioGroupItem } from "@plainworks/elements/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plainworks/elements/select"
import { Skeleton } from "@plainworks/elements/skeleton"
import { Slider } from "@plainworks/elements/slider"
import { Switch } from "@plainworks/elements/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import { Textarea } from "@plainworks/elements/textarea"
import { Toggle } from "@plainworks/elements/toggle"
import { Callout } from "@plainworks/ui/feedback"
import { createRoot } from "react-dom/client"

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
] as const

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"] as const
const ALERT_VARIANTS = ["default", "destructive"] as const
const CALLOUT_TONES = ["info", "success", "warning", "danger"] as const

// One page of unmodified atoms (plus the ui wrappers that add tones) in the states the audit flagged — resting, checked, off, invalid, disabled —
// so the browser gate can measure contrast, target size, focus, and reflow on real layout.
function AtomGallery() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-4">
      <h1 className="text-lg font-semibold">Atom gallery</h1>

      <section aria-label="Actions" className="flex flex-wrap gap-2">
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button disabled>disabled</Button>
        <Toggle aria-label="Bold">B</Toggle>
      </section>

      <section aria-label="Badges" className="flex flex-wrap gap-2">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </section>

      <section aria-label="Alerts" className="grid gap-2">
        {ALERT_VARIANTS.map((variant) => (
          <Alert key={variant} variant={variant}>
            <AlertTitle>{variant} alert</AlertTitle>
            <AlertDescription>Something worth knowing about the {variant} state.</AlertDescription>
          </Alert>
        ))}
        {CALLOUT_TONES.map((tone) => (
          <Callout key={tone} tone={tone} title={`${tone} callout`}>
            Something worth knowing about the {tone} tone.
          </Callout>
        ))}
      </section>

      <section aria-label="Form controls" className="grid gap-3">
        <Label htmlFor="atoms-name">Name</Label>
        <Input id="atoms-name" defaultValue="Ada" />
        <Label htmlFor="atoms-email">Email</Label>
        <Input id="atoms-email" aria-invalid defaultValue="not-an-email" />
        <Label htmlFor="atoms-bio">Bio</Label>
        <Textarea id="atoms-bio" defaultValue="Engineer" />
        <Label htmlFor="atoms-handle">Handle</Label>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>@</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput id="atoms-handle" defaultValue="ada" />
        </InputGroup>
        <Label htmlFor="atoms-tz">Timezone</Label>
        <NativeSelect id="atoms-tz" defaultValue="utc">
          <NativeSelectOption value="utc">UTC</NativeSelectOption>
          <NativeSelectOption value="cet">CET</NativeSelectOption>
        </NativeSelect>
        <Select defaultValue="high" items={PRIORITIES}>
          <SelectTrigger aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((priority) => (
              <SelectItem key={priority.value} value={priority.value}>
                {priority.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox aria-label="Accept terms" defaultChecked />
          <Checkbox aria-label="Subscribe" />
          <Switch aria-label="Notifications on" defaultChecked />
          <Switch aria-label="Notifications off" />
        </div>
        <RadioGroup defaultValue="light" aria-label="Mode" className="flex gap-4">
          <RadioGroupItem value="light" aria-label="Light" />
          <RadioGroupItem value="dark" aria-label="Dark" />
        </RadioGroup>
        {/* The atom renders one thumb per array entry; a bare number yields two. */}
        <Slider aria-label="Volume" defaultValue={[40]} />
        <Progress value={60} aria-label="Upload progress" />
      </section>

      <Tabs defaultValue="first">
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="first">First panel</TabsContent>
        <TabsContent value="second">Second panel</TabsContent>
      </Tabs>

      <section aria-label="Display" className="flex flex-wrap items-center gap-4">
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>GH</AvatarFallback>
          </Avatar>
        </AvatarGroup>
        <Skeleton className="h-4 w-32" />
      </section>
    </main>
  )
}

const root = document.getElementById("fixture")
if (root === null) throw new Error("Missing atom gallery root")
createRoot(root).render(<AtomGallery />)
