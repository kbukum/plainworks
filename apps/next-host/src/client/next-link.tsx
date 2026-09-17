"use client"

import type { AnchorHTMLAttributes, MouseEvent, ReactElement } from "react"

/**
 * The host router adapter for the `ui` breadcrumb `render` seam. It renders each entry as a real
 * `<a href>` and enhances a plain left click into an App Router client navigation through the
 * host's `navigate` (`router.push`) — the same progressive-enhancement contract the Vite showcase
 * backs with its history router. Modified clicks and keyboard activation keep native anchor
 * behavior (open-in-new-tab, Enter to follow). The seam is identical across hosts; only the
 * `navigate` the host supplies differs — this is the navigation seam a host is expected to vary.
 */
export function nextLinkRender(
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
      event.preventDefault()
      navigate(href)
    }
    return (
      // A real `<a href>` progressively enhanced for client navigation is the canonical host-link
      // pattern. It is keyboard-operable and valid natively, so these interactivity lints are false
      // positives here.
      // biome-ignore lint/a11y/noStaticElementInteractions: the element is a real anchor with an href.
      // biome-ignore lint/a11y/useKeyWithClickEvents: an anchor activates on Enter natively; onClick fires for it.
      // biome-ignore lint/a11y/useValidAnchor: it navigates via its href — the click handler only enhances it.
      <a {...props} onClick={onClick} />
    )
  }
}
