import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@plainworks/elements/alert-dialog"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { Button } from "@plainworks/elements/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@plainworks/elements/command"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@plainworks/elements/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@plainworks/elements/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@plainworks/elements/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@plainworks/elements/hover-card"
import { Input } from "@plainworks/elements/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@plainworks/elements/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@plainworks/elements/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@plainworks/elements/tooltip"
import { type ReactElement, useState } from "react"
import { Category, Section } from "./frame"

export function OverlaysGroup(): ReactElement {
  const [commandOpen, setCommandOpen] = useState(false)
  return (
    <Category title="Overlays">
      <Section name="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" data-gallery-trigger="dialog" />}>
            Open dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>Make changes to your profile here.</DialogDescription>
            </DialogHeader>
            <Input aria-label="Dialog name" defaultValue="Ada Lovelace" />
            <DialogFooter showCloseButton>
              <Button>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
      <Section name="Alert dialog">
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" data-gallery-trigger="alert-dialog" />}
          >
            Open alert dialog
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Section>
      <Section name="Sheet">
        <Sheet>
          <SheetTrigger render={<Button variant="outline" data-gallery-trigger="sheet" />}>
            Open sheet
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow the order list.</SheetDescription>
            </SheetHeader>
            <div className="p-4">
              <Input aria-label="Sheet search" placeholder="Search…" />
            </div>
            <SheetFooter>
              <Button>Apply</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>
      <Section name="Popover">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" data-gallery-trigger="popover" />}>
            Open popover
          </PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Dimensions</PopoverTitle>
              <PopoverDescription>Set the layer size.</PopoverDescription>
            </PopoverHeader>
            <Input aria-label="Width" defaultValue="100%" />
          </PopoverContent>
        </Popover>
      </Section>
      <Section name="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" data-gallery-trigger="dropdown-menu" />}
          >
            Open dropdown menu
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuItem>
                Profile <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>Billing</DropdownMenuItem>
              <DropdownMenuItem disabled>Disabled</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>Show status bar</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value="top">
              <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>
      <Section name="Context menu">
        <ContextMenu>
          <ContextMenuTrigger
            data-gallery-trigger="context-menu"
            aria-label="Open context menu"
            className="flex h-24 w-64 items-center justify-center rounded-md border border-dashed text-sm"
          >
            Right-click here (Open context menu)
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuLabel>Actions</ContextMenuLabel>
              <ContextMenuItem>
                Back <ContextMenuShortcut>⌘[</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>Reload</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem checked>Show bookmarks</ContextMenuCheckboxItem>
            <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>
      <Section name="Hover card">
        <HoverCard>
          <HoverCardTrigger href="#profile" data-gallery-trigger="hover-card">
            Open hover card (@plainworks)
          </HoverCardTrigger>
          <HoverCardContent>
            <div className="flex gap-3">
              <Avatar>
                <AvatarFallback>PW</AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-semibold">@plainworks</p>
                <p>Host-independent React kit.</p>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      </Section>
      <Section name="Tooltip">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" data-gallery-trigger="tooltip" />}>
              Open tooltip
            </TooltipTrigger>
            <TooltipContent>Add to library</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Section>
      <Section name="Command">
        <Command className="w-80 rounded-lg border" label="Command menu">
          <CommandInput placeholder="Type a command…" />
          {/* No `CommandSeparator` here: the list is a listbox, which may own only options and
              groups, and cmdk hard-codes the separator's role. Group headings divide instead. */}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>Calendar</CommandItem>
              <CommandItem>Search emoji</CommandItem>
              <CommandItem disabled>Calculator</CommandItem>
            </CommandGroup>
            <CommandGroup heading="Settings">
              <CommandItem>
                Profile <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                Billing <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <Button
          variant="outline"
          data-gallery-trigger="command"
          onClick={() => setCommandOpen(true)}
        >
          Open command
        </Button>
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Pages">
                <CommandItem>Orders</CommandItem>
                <CommandItem>Settings</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </Section>
    </Category>
  )
}
