import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@plainworks/elements/breadcrumb"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@plainworks/elements/menubar"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@plainworks/elements/navigation-menu"
import {
  Pagination as PaginationAtom,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@plainworks/elements/pagination"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plainworks/elements/tabs"
import type { ReactElement } from "react"
import { Box, Category, Section } from "./frame"

export function NavigationGroup(): ReactElement {
  return (
    <Category title="Navigation">
      <Section name="Breadcrumb">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#home">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#orders">Orders</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>ORD-1042</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>
      <Section name="Pagination">
        <PaginationAtom>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#prev" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#1">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#2" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#3">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#next" />
            </PaginationItem>
          </PaginationContent>
        </PaginationAtom>
      </Section>
      <Section name="Tabs">
        <Tabs defaultValue="account" className="w-96">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <Box>Account settings panel.</Box>
          </TabsContent>
          <TabsContent value="password">
            <Box>Password panel.</Box>
          </TabsContent>
        </Tabs>
        <Tabs defaultValue="overview" className="w-96">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Box>Line variant.</Box>
          </TabsContent>
          <TabsContent value="activity">
            <Box>Activity.</Box>
          </TabsContent>
        </Tabs>
      </Section>
      <Section name="Menubar">
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger data-gallery-trigger="menubar">File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                New tab <MenubarShortcut>⌘T</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>New window</MenubarItem>
              <MenubarSeparator />
              <MenubarItem variant="destructive">Close</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Undo</MenubarItem>
              <MenubarItem>Redo</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </Section>
      <Section name="Navigation menu">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger data-gallery-trigger="navigation-menu">
                Products
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-80 gap-2 p-2">
                  <li>
                    <NavigationMenuLink href="#analytics">Analytics</NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink href="#billing">Billing</NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#docs">Docs</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </Section>
    </Category>
  )
}
