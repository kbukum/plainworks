import { devices } from "@playwright/test"

/** A viewport size in CSS pixels. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

// The two sizes the profiles pin by hand, where no Playwright descriptor fits. `desktop` is a
// common 1440x900 laptop. `reflow` is the WCAG 1.4.10 target: 320 CSS px, a 1280 px desktop at
// 400% zoom, so media and container queries collapse the way they would for a user at that zoom.
const DESKTOP_VIEWPORT: ViewportSize = { width: 1440, height: 900 }
const REFLOW_VIEWPORT: ViewportSize = { width: 320, height: 640 }

/**
 * A device a flow runs on: the browser context options that change what a page renders — its
 * viewport, pixel density, and whether it is a touch phone or tablet (`pointer: coarse`, mobile
 * viewport meta). A flow replays once per device, because none of these can change on a live page.
 */
export interface DeviceProfile {
  readonly id: DeviceId
  readonly viewport: ViewportSize
  readonly deviceScaleFactor: number
  readonly isMobile: boolean
  readonly hasTouch: boolean
}

/** The devices a flow can run on. */
export const DEVICE_IDS = ["desktop", "tablet", "mobile", "landscape", "reflow"] as const

/** One device of {@link DEVICE_IDS}. */
export type DeviceId = (typeof DEVICE_IDS)[number]

type Descriptor = (typeof devices)[keyof typeof devices]

// Only the context options that change rendering. The descriptor's user agent and default browser
// are dropped: the suite runs its own Chromium, and a borrowed user agent would only mislead it.
const profile = (id: DeviceId, descriptor: Descriptor, viewport?: ViewportSize): DeviceProfile => ({
  id,
  viewport: viewport ?? descriptor.viewport,
  deviceScaleFactor: descriptor.deviceScaleFactor,
  isMobile: descriptor.isMobile,
  hasTouch: descriptor.hasTouch,
})

/**
 * The device profiles, built on Playwright's device descriptors. `desktop` is a common 1440 px
 * laptop, `tablet` sits on the 768 px breakpoint with touch, `mobile` is a touch phone, and
 * `landscape` is that phone turned sideways, the shortest common screen. `reflow` is the WCAG
 * 1.4.10 target: 320 CSS px, a 1280 px desktop at 400% zoom, so it keeps a mouse, not touch.
 */
export const DEVICE_PROFILES: { readonly [Id in DeviceId]: DeviceProfile } = {
  desktop: profile("desktop", devices["Desktop Chrome"], DESKTOP_VIEWPORT),
  tablet: profile("tablet", devices["iPad Mini"]),
  mobile: profile("mobile", devices["Pixel 7"]),
  landscape: profile("landscape", devices["Pixel 7 landscape"]),
  reflow: profile("reflow", devices["Desktop Chrome"], REFLOW_VIEWPORT),
}

/** The Playwright context options a device maps to, for `test.use`. */
export interface DeviceContextOptions {
  readonly viewport: ViewportSize
  readonly deviceScaleFactor: number
  readonly isMobile: boolean
  readonly hasTouch: boolean
}

/** The context options for `device`. */
export function deviceContextOptions(device: DeviceProfile): DeviceContextOptions {
  return {
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  }
}
