// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/alert"
import { AspectRatio } from "@/shadcn/aspect-ratio"
import { Avatar, AvatarFallback } from "@/shadcn/avatar"
import { Badge } from "@/shadcn/badge"
import { Button } from "@/shadcn/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shadcn/card"
import { Checkbox } from "@/shadcn/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/shadcn/field"
import { Input } from "@/shadcn/input"
import { InputGroup, InputGroupInput, InputGroupText } from "@/shadcn/input-group"
import { Kbd } from "@/shadcn/kbd"
import { Label } from "@/shadcn/label"
import { NativeSelect, NativeSelectOption } from "@/shadcn/native-select"
import { Progress, ProgressIndicator, ProgressTrack } from "@/shadcn/progress"
import { RadioGroup, RadioGroupItem } from "@/shadcn/radio-group"
import { Separator } from "@/shadcn/separator"
import { Skeleton } from "@/shadcn/skeleton"
import { Slider } from "@/shadcn/slider"
import { Switch } from "@/shadcn/switch"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shadcn/table"
import { Textarea } from "@/shadcn/textarea"

// A cross-category gallery — form, display, feedback, layout, data — rendered together so one axe
// pass proves the owned atom set is accessible by default, and one server pass proves it is
// host-independent (SSR-safe, no DOM access at render) despite each atom being a `"use client"`
// module. Every interactive control carries an accessible name so the axe assertion is meaningful.
function Gallery() {
  return (
    <main>
      <Button>Save</Button>
      <Badge>New</Badge>

      <Card aria-labelledby="gallery-card-title">
        <CardHeader>
          <CardTitle id="gallery-card-title">Profile</CardTitle>
          <CardDescription>Update your details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="gallery-name">Display name</Label>
          <Input id="gallery-name" defaultValue="Ada" />

          <Label htmlFor="gallery-bio">Bio</Label>
          <Textarea id="gallery-bio" defaultValue="Engineer" />

          <Field>
            <FieldLabel htmlFor="gallery-handle">Handle</FieldLabel>
            <FieldContent>
              <InputGroup>
                <InputGroupText>@</InputGroupText>
                <InputGroupInput id="gallery-handle" defaultValue="ada" />
              </InputGroup>
              <FieldDescription>Your public username.</FieldDescription>
            </FieldContent>
          </Field>

          <Label htmlFor="gallery-tz">Timezone</Label>
          <NativeSelect id="gallery-tz" defaultValue="utc">
            <NativeSelectOption value="utc">UTC</NativeSelectOption>
            <NativeSelectOption value="cet">CET</NativeSelectOption>
          </NativeSelect>

          <Checkbox aria-label="Accept terms" />
          <Switch aria-label="Enable notifications" />
          <Slider aria-label="Volume" defaultValue={40} />

          <RadioGroup defaultValue="light" aria-label="Theme">
            <Label>
              <RadioGroupItem value="light" /> Light
            </Label>
            <Label>
              <RadioGroupItem value="dark" /> Dark
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Your profile was updated.</AlertDescription>
      </Alert>

      <Progress value={60} aria-label="Upload progress">
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>

      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>
      <Separator />
      <Skeleton className="h-4 w-24" />
      <p>
        Press <Kbd>⌘</Kbd>
      </p>

      <AspectRatio ratio={16 / 9}>
        <div>preview</div>
      </AspectRatio>

      <Table>
        <TableCaption>Recent invoices</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>INV-001</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </main>
  )
}

describe("owned atom set", () => {
  it("renders a cross-category gallery with no accessibility violations", async () => {
    const { container } = render(<Gallery />)
    await expectNoAxeViolations(container)
  }, 20_000)

  it("renders to static markup on the server without a host", () => {
    const html = renderToStaticMarkup(<Gallery />)
    expect(html).toContain("Save")
    expect(html).toContain("Recent invoices")
    expect(html.length).toBeGreaterThan(0)
  })
})
