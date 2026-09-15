"use client"

import {
  type AnchorHTMLAttributes,
  createContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

/** The app-local router surface — the current path plus a client-side navigate. */
export interface Router {
  readonly path: string
  readonly navigate: (to: string) => void
}

const RouterContext = createContext<Router | null>(null)

/** Props for {@link RouterProvider}. */
export interface RouterProviderProps {
  /** The path the server rendered, so the first client render matches the markup (no mismatch). */
  readonly initialPath: string
  readonly children: ReactNode
}

/** Normalize any relative or absolute URL string to its pathname. */
export function parsePathname(urlOrPath: string): string {
  try {
    return new URL(urlOrPath, "http://localhost").pathname
  } catch {
    return urlOrPath
  }
}

/**
 * A tiny app-local history router — no new package, route tree app-local. It seeds from the
 * server-rendered `initialPath` so hydration matches, then keeps the address bar in sync with
 * `history.pushState` and listens for the browser's back/forward `popstate`. Navigation never
 * reloads the page.
 */
export function RouterProvider({ initialPath, children }: RouterProviderProps): ReactElement {
  const [path, setPath] = useState(() => parsePathname(initialPath))

  useEffect(() => {
    const onPop = (): void => setPath(parsePathname(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate = useCallback((to: string): void => {
    window.history.pushState(null, "", to)
    setPath(parsePathname(to))
  }, [])

  const value = useMemo<Router>(() => ({ path, navigate }), [path, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

/** Read the app router; throws when used outside {@link RouterProvider}. */
export function useRouter(): Router {
  const router = useContext(RouterContext)
  if (router === null) {
    throw new Error("useRouter must be used inside <RouterProvider>.")
  }
  return router
}

/**
 * Build the breadcrumb `render` callback that turns the kit's `ui` breadcrumb link into a
 * router-aware, client-navigating anchor. It stays a real `<a href>` (keyboard-operable,
 * right-click/open-in-new-tab intact), but a plain left click is intercepted and routed through
 * {@link Router.navigate} instead of reloading the page.
 */
export function routerLinkRender(
  navigate: (to: string) => void,
): (props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactElement {
  return (props) => {
    const href = props.href ?? "/"
    const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
      props.onClick?.(event)
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      // A plain left click is routed client-side; every modified click and keyboard/context
      // interaction keeps the native anchor behavior (open-in-new-tab, Enter to activate).
      event.preventDefault()
      navigate(href)
    }
    return (
      // A real `<a href>` progressively enhanced for client navigation is the canonical host-link
      // pattern (a Next.js `<Link>` does the same). It is keyboard-operable and valid natively, so
      // these interactivity lints are false positives here.
      // biome-ignore lint/a11y/noStaticElementInteractions: the element is a real anchor with an href.
      // biome-ignore lint/a11y/useKeyWithClickEvents: an anchor activates on Enter natively; onClick fires for it.
      // biome-ignore lint/a11y/useValidAnchor: it navigates via its href — the click handler only enhances it.
      <a {...props} onClick={onClick} />
    )
  }
}
