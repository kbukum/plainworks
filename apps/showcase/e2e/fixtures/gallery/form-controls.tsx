import { Button } from "@plainworks/elements/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@plainworks/elements/button-group"
import { Calendar } from "@plainworks/elements/calendar"
import { Checkbox } from "@plainworks/elements/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@plainworks/elements/field"
import { Input } from "@plainworks/elements/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@plainworks/elements/input-group"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@plainworks/elements/input-otp"
import { Label } from "@plainworks/elements/label"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@plainworks/elements/native-select"
import { RadioGroup, RadioGroupItem } from "@plainworks/elements/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@plainworks/elements/select"
import { Slider } from "@plainworks/elements/slider"
import { Switch } from "@plainworks/elements/switch"
import { Textarea } from "@plainworks/elements/textarea"
import { Toggle } from "@plainworks/elements/toggle"
import { ToggleGroup, ToggleGroupItem } from "@plainworks/elements/toggle-group"
import { Spinner } from "@plainworks/ui/feedback/spinner"
import { BoldIcon, InfoIcon, ItalicIcon, SearchIcon, UnderlineIcon } from "lucide-react"
import { type ReactElement, useState } from "react"
import { Category, FIXED_DATE, Row, Section } from "./frame"

const BUTTON_VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const
const BUTTON_SIZES = ["default", "sm", "lg"] as const
const ICON_SIZES = ["icon", "icon-sm", "icon-lg"] as const
// `items` maps each value to its label, so the closed trigger shows "Apple", not "apple".
const FRUITS = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "durian", label: "Durian" },
]
const SIZES = [{ value: "s", label: "Small" }]

export function FormControlsGroup(): ReactElement {
  const [otp, setOtp] = useState("1234")
  return (
    <Category title="Form controls">
      <Section name="Button">
        {BUTTON_VARIANTS.map((variant) => (
          <Row key={variant} label={variant}>
            {BUTTON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {variant} {size}
              </Button>
            ))}
            {ICON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size} aria-label={`${variant} ${size}`}>
                <InfoIcon />
              </Button>
            ))}
            <Button variant={variant} disabled>
              disabled
            </Button>
          </Row>
        ))}
        <Row label="loading">
          <Button disabled aria-busy>
            <Spinner size="sm" label="Saving" /> Saving…
          </Button>
        </Row>
      </Section>
      <Section name="Button group">
        <ButtonGroup aria-label="Text alignment">
          <Button variant="outline">Left</Button>
          <Button variant="outline">Center</Button>
          <Button variant="outline">Right</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="Search">
          <ButtonGroupText>https://</ButtonGroupText>
          <Input aria-label="Domain" defaultValue="plainworks.dev" />
          <ButtonGroupSeparator />
          <Button variant="outline">Go</Button>
        </ButtonGroup>
        <ButtonGroup orientation="vertical" aria-label="Zoom">
          <Button variant="outline">Zoom in</Button>
          <Button variant="outline">Zoom out</Button>
        </ButtonGroup>
      </Section>
      <Section name="Input">
        <Row label="default">
          <Input aria-label="Default input" defaultValue="Ada Lovelace" className="max-w-xs" />
        </Row>
        <Row label="placeholder">
          <Input
            aria-label="Placeholder input"
            placeholder="name@example.com"
            className="max-w-xs"
          />
        </Row>
        <Row label="disabled">
          <Input
            aria-label="Disabled input"
            disabled
            defaultValue="Read only"
            className="max-w-xs"
          />
        </Row>
        <Row label="invalid">
          <Input
            aria-label="Invalid input"
            aria-invalid
            defaultValue="not-an-email"
            className="max-w-xs"
          />
        </Row>
        <Row label="file">
          <Input aria-label="File input" type="file" className="max-w-xs" />
        </Row>
      </Section>
      <Section name="Input group">
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search orders" placeholder="Search orders…" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs">Search</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup className="max-w-xs">
          <InputGroupAddon>
            <InputGroupText>$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput aria-label="Amount" defaultValue="120.00" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup className="max-w-sm">
          <InputGroupTextarea aria-label="Message" placeholder="Write a message…" />
          <InputGroupAddon align="block-end">
            <InputGroupButton size="sm" variant="default">
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Section>
      <Section name="Input OTP">
        <InputOTP maxLength={6} value={otp} onChange={setOtp} aria-label="Verification code">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </Section>
      <Section name="Textarea">
        <Textarea aria-label="Bio" defaultValue="Engineer and writer." className="max-w-xs" />
        <Textarea aria-label="Notes" placeholder="Add notes…" className="max-w-xs" />
        <Textarea aria-label="Disabled notes" disabled defaultValue="Locked" className="max-w-xs" />
        <Textarea
          aria-label="Invalid notes"
          aria-invalid
          defaultValue="Too short"
          className="max-w-xs"
        />
      </Section>
      <Section name="Label">
        <Label htmlFor="label-demo">Email address</Label>
        <Input id="label-demo" className="max-w-xs" defaultValue="ada@example.com" />
      </Section>
      <Section name="Checkbox">
        <Label>
          <Checkbox /> Unchecked
        </Label>
        <Label>
          <Checkbox defaultChecked /> Checked
        </Label>
        <Label>
          <Checkbox indeterminate /> Indeterminate
        </Label>
        <Label>
          <Checkbox disabled /> Disabled
        </Label>
        <Label>
          <Checkbox aria-invalid /> Invalid
        </Label>
      </Section>
      <Section name="Radio group">
        <RadioGroup defaultValue="comfortable" aria-label="Density">
          <Label>
            <RadioGroupItem value="default" /> Default
          </Label>
          <Label>
            <RadioGroupItem value="comfortable" /> Comfortable
          </Label>
          <Label>
            <RadioGroupItem value="compact" disabled /> Compact (disabled)
          </Label>
        </RadioGroup>
      </Section>
      <Section name="Switch">
        <Label>
          <Switch /> Off
        </Label>
        <Label>
          <Switch defaultChecked /> On
        </Label>
        <Label>
          <Switch size="sm" defaultChecked /> Small
        </Label>
        <Label>
          <Switch disabled /> Disabled
        </Label>
      </Section>
      <Section name="Slider">
        {/*
          A slider names its thumbs through `aria-labelledby`; `aria-label` stays on the group. Pass
          the value as an array: the atom renders one thumb per entry, and a bare number renders two.
        */}
        <div className="grid w-64 gap-2">
          <Label id="slider-volume">Volume</Label>
          <Slider aria-labelledby="slider-volume" defaultValue={[40]} />
        </div>
        <div className="grid w-64 gap-2">
          <Label id="slider-price">Price range</Label>
          <Slider aria-labelledby="slider-price" defaultValue={[20, 80]} />
        </div>
        <div className="grid w-64 gap-2">
          <Label id="slider-disabled">Disabled slider</Label>
          <Slider aria-labelledby="slider-disabled" defaultValue={[60]} disabled />
        </div>
      </Section>
      <Section name="Native select">
        <NativeSelect aria-label="Timezone" defaultValue="utc">
          <NativeSelectOption value="utc">UTC</NativeSelectOption>
          <NativeSelectOption value="cet">CET</NativeSelectOption>
          <NativeSelectOptGroup label="Americas">
            <NativeSelectOption value="est">EST</NativeSelectOption>
            <NativeSelectOption value="pst">PST</NativeSelectOption>
          </NativeSelectOptGroup>
        </NativeSelect>
        <NativeSelect aria-label="Small select" size="sm" defaultValue="a">
          <NativeSelectOption value="a">Small</NativeSelectOption>
        </NativeSelect>
        <NativeSelect aria-label="Disabled select" disabled>
          <NativeSelectOption value="a">Disabled</NativeSelectOption>
        </NativeSelect>
        <NativeSelect aria-label="Invalid select" aria-invalid>
          <NativeSelectOption value="a">Invalid</NativeSelectOption>
        </NativeSelect>
      </Section>
      <Section name="Select">
        <div data-gallery-trigger="select">
          <Select defaultValue="apple" items={FRUITS}>
            <SelectTrigger aria-label="Open select" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Fruits</SelectLabel>
                {FRUITS.map((fruit) => (
                  <SelectItem
                    key={fruit.value}
                    value={fruit.value}
                    disabled={fruit.value === "durian"}
                  >
                    {fruit.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Select defaultValue="s" items={SIZES}>
          <SelectTrigger size="sm" aria-label="Small select trigger" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section name="Toggle">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle aria-label="Italic" defaultPressed>
          <ItalicIcon />
        </Toggle>
        <Toggle variant="outline" aria-label="Underline">
          <UnderlineIcon /> Outline
        </Toggle>
        <Toggle size="sm" aria-label="Small">
          Small
        </Toggle>
        <Toggle size="lg" aria-label="Large">
          Large
        </Toggle>
        <Toggle disabled aria-label="Disabled">
          Disabled
        </Toggle>
      </Section>
      <Section name="Toggle group">
        <ToggleGroup aria-label="Formatting" defaultValue={["bold"]}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <BoldIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <ItalicIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <UnderlineIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup variant="outline" spacing={2} aria-label="View" defaultValue={["list"]}>
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
        </ToggleGroup>
      </Section>
      <Section name="Field">
        <FieldSet className="max-w-md">
          <FieldLegend>Profile</FieldLegend>
          <FieldDescription>Shown on your public page.</FieldDescription>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="field-name">Name</FieldLabel>
              <Input id="field-name" defaultValue="Ada" />
              <FieldDescription>Your full name.</FieldDescription>
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="field-email">Email</FieldLabel>
              <Input id="field-email" aria-invalid defaultValue="ada@" />
              <FieldError>Enter a valid email address.</FieldError>
            </Field>
            <FieldSeparator>Or</FieldSeparator>
            <Field orientation="horizontal">
              <Checkbox id="field-news" />
              <FieldContent>
                <FieldLabel htmlFor="field-news">Newsletter</FieldLabel>
                <FieldDescription>Monthly product updates.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </FieldSet>
      </Section>
      <Section name="Calendar">
        <Calendar mode="single" selected={FIXED_DATE} defaultMonth={FIXED_DATE} />
        <Calendar
          mode="range"
          selected={{ from: FIXED_DATE, to: new Date(2026, 2, 20) }}
          defaultMonth={FIXED_DATE}
        />
      </Section>
    </Category>
  )
}
