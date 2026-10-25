"use client"

/** An observer that never reports: jsdom does no layout, so there is never a size to observe. */
class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * Install inert stand-ins for the layout APIs jsdom lacks: `ResizeObserver` and
 * `Element.prototype.scrollIntoView`. Widgets such as command lists call them on mount, so a test
 * that renders one must install these first. Both are `configurable`, so a later install replaces
 * the previous one and jsdom discards them at teardown.
 */
export function installLayoutApis(): void {
  // Read from globalThis so packages typechecked without DOM types still compile.
  const { Element } = globalThis as typeof globalThis & {
    readonly Element?: { readonly prototype: object }
  }
  if (Element === undefined)
    throw new Error("installLayoutApis needs a DOM test environment such as jsdom")
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: InertResizeObserver,
  })
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: () => undefined,
  })
}
