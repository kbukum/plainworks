import { BROWSER_GATE_NOW, browserGateUse } from "../gate"

/** Options for {@link playwrightMcpConfig}. All paths are absolute. */
export interface PlaywrightMcpOptions {
  /** The warm host's origin. The browser may reach no other. */
  readonly origin: string
  /** The page script {@link playwrightMcpInitPage} renders. */
  readonly initPage: string
  /** Where MCP writes screenshots and snapshots. */
  readonly outputDir: string
  /** The Chromium to launch, such as the one the gate runs, so no second browser is downloaded. */
  readonly executablePath?: string
  readonly viewport?: { readonly width: number; readonly height: number }
}

/** The part of a Playwright MCP `--config` file `ui:capture serve` writes. */
export interface PlaywrightMcpConfig {
  readonly browser: {
    readonly browserName: "chromium"
    readonly isolated: true
    readonly launchOptions: { readonly headless: true; readonly executablePath?: string }
    readonly contextOptions: typeof browserGateUse & {
      readonly baseURL: string
      readonly viewport: { readonly width: number; readonly height: number }
    }
    readonly initPage: readonly string[]
  }
  readonly network: { readonly allowedOrigins: readonly string[] }
  readonly outputDir: string
}

/**
 * Configure Playwright MCP to explore the warm host the way a capture sees it: a fresh, isolated,
 * context with the gate's locale, time zone, reduced motion, and blocked service
 * workers, a fixed clock, and no origin but the host's.
 */
export function playwrightMcpConfig(options: PlaywrightMcpOptions): PlaywrightMcpConfig {
  return {
    browser: {
      browserName: "chromium",
      isolated: true,
      launchOptions: {
        headless: true,
        ...(options.executablePath === undefined ? {} : { executablePath: options.executablePath }),
      },
      contextOptions: {
        baseURL: options.origin,
        ...browserGateUse,
        viewport: options.viewport ?? { width: 1280, height: 800 },
      },
      initPage: [options.initPage],
    },
    network: { allowedOrigins: [options.origin] },
    outputDir: options.outputDir,
  }
}

/** The Playwright MCP page script that pins each page's clock to {@link BROWSER_GATE_NOW}. */
export function playwrightMcpInitPage(now: string = BROWSER_GATE_NOW): string {
  return `// Written by ui:capture serve. Pins the page clock, as every capture does.
export default async ({ page }: { page: { clock: { setFixedTime(time: string): Promise<void> } } }) => {
  await page.clock.setFixedTime(${JSON.stringify(now)})
}
`
}
