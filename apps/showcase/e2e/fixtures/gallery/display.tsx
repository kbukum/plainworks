import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@plainworks/elements/accordion"
import { AspectRatio } from "@plainworks/elements/aspect-ratio"
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@plainworks/elements/avatar"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plainworks/elements/collapsible"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@plainworks/elements/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@plainworks/elements/item"
import { Kbd, KbdGroup } from "@plainworks/elements/kbd"
import { ScrollArea } from "@plainworks/elements/scroll-area"
import { Separator } from "@plainworks/elements/separator"
import { InboxIcon } from "lucide-react"
import type { ReactElement } from "react"
import { Box, Category, Section } from "./frame"

const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const

export function DisplayGroup(): ReactElement {
  return (
    <Category title="Display">
      <Section name="Badge">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Section>
      <Section name="Avatar">
        <Avatar size="sm">
          <AvatarFallback>SM</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>AL</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>LG</AvatarFallback>
          <AvatarBadge />
        </Avatar>
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>CD</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </Section>
      <Section name="Card">
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Monthly plan</CardTitle>
            <CardDescription>Billed on the 14th of each month.</CardDescription>
            <CardAction>
              <Badge variant="secondary">Active</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm">3 seats · 12 projects · 40 GB storage</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Upgrade</Button>
            <Button size="sm" variant="outline">
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </Section>
      <Section name="Item">
        {/* `ItemGroup` is a list, so each item is a list item and the separator is decorative. */}
        <ItemGroup className="w-96">
          <Item role="listitem">
            <ItemMedia variant="icon">
              <InboxIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Default item</ItemTitle>
              <ItemDescription>With icon media and an action.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="outline">
                Open
              </Button>
            </ItemActions>
          </Item>
          <ItemSeparator aria-hidden />
          <Item role="listitem" variant="outline">
            <ItemContent>
              <ItemTitle>Outline item</ItemTitle>
              <ItemDescription>Bordered variant.</ItemDescription>
            </ItemContent>
          </Item>
          <Item role="listitem" variant="muted" size="sm">
            <ItemContent>
              <ItemTitle>Muted small item</ItemTitle>
            </ItemContent>
          </Item>
        </ItemGroup>
      </Section>
      <Section name="Kbd">
        <Kbd>⌘</Kbd>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>P</Kbd>
        </KbdGroup>
      </Section>
      <Section name="Separator">
        <div className="flex w-64 flex-col gap-2">
          <span className="text-sm">Above</span>
          <Separator />
          <span className="text-sm">Below</span>
        </div>
        <div className="flex h-6 items-center gap-2">
          <span className="text-sm">Left</span>
          <Separator orientation="vertical" />
          <span className="text-sm">Right</span>
        </div>
      </Section>
      <Section name="Aspect ratio">
        <div className="w-64">
          <AspectRatio ratio={16 / 9} className="rounded-md bg-muted">
            <div className="flex size-full items-center justify-center text-sm">16 / 9</div>
          </AspectRatio>
        </div>
      </Section>
      <Section name="Accordion">
        <Accordion className="w-96" defaultValue={["shipping"]}>
          <AccordionItem value="shipping">
            <AccordionTrigger>Shipping</AccordionTrigger>
            <AccordionContent>Orders ship within two business days.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="returns">
            <AccordionTrigger>Returns</AccordionTrigger>
            <AccordionContent>Returns are accepted within 30 days.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="disabled" disabled>
            <AccordionTrigger>Disabled item</AccordionTrigger>
            <AccordionContent>Hidden.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>
      <Section name="Collapsible">
        <Collapsible defaultOpen className="w-80">
          <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
            Toggle details
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Box>Collapsible content is visible.</Box>
          </CollapsibleContent>
        </Collapsible>
      </Section>
      <Section name="Scroll area">
        <ScrollArea className="h-32 w-64 rounded-md border">
          <div className="p-3">
            {Array.from({ length: 20 }, (_, index) => (
              <div key={index} className="text-sm">
                Tag v1.{index}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>
      <Section name="Empty">
        <Empty className="w-96 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No orders yet</EmptyTitle>
            <EmptyDescription>Orders you create will show up here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm">Create order</Button>
          </EmptyContent>
        </Empty>
      </Section>
    </Category>
  )
}
