"use client"

import { Button, buttonVariants } from "@plainworks/elements/button"
import { cn } from "@plainworks/theme"
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react"
import { Drawer } from "../overlays"

/** Every user-facing string of the {@link AppShell}, injected so it ships no fixed copy. */
export interface AppShellLabels {
  readonly skipToContent: string
  /** Accessible name of the button that opens the navigation drawer on narrow screens. */
  readonly openNavigation: string
  /** Title of the navigation drawer. */
  readonly navigation: string
}

/** English defaults for every {@link AppShellLabels} field. */
export const defaultAppShellLabels: AppShellLabels = {
  skipToContent: "Skip to main content",
  openNavigation: "Open navigation",
  navigation: "Navigation",
}

/** Where the shell is rendering the navigation, passed to {@link AppShellProps.navigation}. */
export interface AppShellNavigationSlot {
  /** `rail` beside the content on wide screens, `drawer` inside the narrow-screen drawer. */
  readonly placement: "rail" | "drawer"
  /** Call after a link is chosen, so the drawer closes. A no-op in the rail. */
  readonly onNavigate: () => void
}

/** Props for {@link AppShell}. */
export interface AppShellProps {
  /** The product mark at the start of the header. */
  readonly brand: ReactNode
  /**
   * Renders the primary navigation for a placement. It renders twice, once for the rail and once
   * for the drawer, so give each placement a unique landmark label.
   */
  readonly navigation: (slot: AppShellNavigationSlot) => ReactNode
  /** Global actions at the end of the header: search, notifications, color mode, account. */
  readonly actions?: ReactNode
  /** Accessible name of the main landmark, usually the current page title. */
  readonly mainLabel: string
  /**
   * Identifies the current route. When it changes after the first render, focus moves to the main
   * landmark so keyboard and screen-reader users start at the new page.
   */
  readonly navigationKey?: string
  /** Icon for the drawer button (an SVG element); injected, never imported here. */
  readonly menuIcon?: ReactNode
  /** The main landmark's id, targeted by the skip link. Defaults to `"main-content"`. */
  readonly mainId?: string
  readonly labels?: Partial<AppShellLabels>
  /** The page content. */
  readonly children: ReactNode
  readonly className?: string
}

/**
 * The frame of an application: a sticky one-row header, a navigation rail beside the content on
 * wide screens that becomes a drawer on narrow ones, and the main landmark. It adapts to its own
 * width through a container query, not the viewport. The header never wraps: keep `actions`
 * compact, such as icon buttons with accessible names. Routing stays with the host.
 */
export function AppShell({
  brand,
  navigation,
  actions,
  mainLabel,
  navigationKey,
  menuIcon,
  mainId = "main-content",
  labels,
  children,
  className,
}: AppShellProps): ReactElement {
  const copy = { ...defaultAppShellLabels, ...labels }
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const previousKey = useRef(navigationKey)

  useEffect(() => {
    if (previousKey.current === navigationKey) return
    previousKey.current = navigationKey
    mainRef.current?.focus()
  }, [navigationKey])

  return (
    <div
      data-slot="app-shell"
      className={cn(
        "@container/shell grid min-h-dvh grid-rows-[auto_1fr] bg-background text-foreground",
        className,
      )}
    >
      <a
        href={`#${mainId}`}
        className={cn(
          buttonVariants({ variant: "default" }),
          "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-toast",
        )}
      >
        {copy.skipToContent}
      </a>
      <header className="sticky top-0 z-sticky flex h-14 min-w-0 flex-nowrap items-center gap-1 border-b bg-background/95 px-2 backdrop-blur @sm/shell:gap-2 @sm/shell:px-4">
        <Drawer
          side="left"
          title={copy.navigation}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={copy.openNavigation}
              className="shrink-0 @3xl/shell:hidden"
            >
              {menuIcon ?? <span aria-hidden>☰</span>}
            </Button>
          }
        >
          {navigation({ placement: "drawer", onNavigate: () => setDrawerOpen(false) })}
        </Drawer>
        <div className="min-w-0 flex-1 truncate font-semibold tracking-tight">{brand}</div>
        {actions === undefined ? null : (
          <div data-slot="app-shell-actions" className="flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </header>
      <div className="grid min-h-0 grid-cols-1 @3xl/shell:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden border-r bg-muted/30 p-3 @3xl/shell:block">
          {navigation({ placement: "rail", onNavigate: () => undefined })}
        </aside>
        <main
          ref={mainRef}
          id={mainId}
          tabIndex={-1}
          aria-label={mainLabel}
          className="min-w-0 px-4 py-6 outline-none @sm/shell:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
