import { describe, expect, it } from "vitest"
import { BROWSER_GATE_NOW } from "../gate"
import { playwrightMcpConfig, playwrightMcpInitPage } from "./mcp"

describe("playwrightMcpConfig", () => {
  it("points an isolated browser at the warm host with the gate's deterministic context", () => {
    const config = playwrightMcpConfig({
      origin: "http://127.0.0.1:5190",
      initPage: "/app/.ui-artifacts/mcp/init-page.ts",
      outputDir: "/app/.ui-artifacts/mcp/output",
      executablePath: "/cache/chromium",
    })
    expect(config).toEqual({
      browser: {
        browserName: "chromium",
        isolated: true,
        launchOptions: { headless: true, executablePath: "/cache/chromium" },
        contextOptions: {
          baseURL: "http://127.0.0.1:5190",
          locale: "en-US",
          timezoneId: "UTC",
          colorScheme: "light",
          reducedMotion: "reduce",
          serviceWorkers: "block",
          viewport: { width: 1280, height: 800 },
        },
        initPage: ["/app/.ui-artifacts/mcp/init-page.ts"],
      },
      network: { allowedOrigins: ["http://127.0.0.1:5190"] },
      outputDir: "/app/.ui-artifacts/mcp/output",
    })
  })

  it("leaves the browser to MCP when no executable is given", () => {
    const config = playwrightMcpConfig({
      origin: "http://127.0.0.1:5190",
      initPage: "i.ts",
      outputDir: "out",
    })
    expect(config.browser.launchOptions).toEqual({ headless: true })
    expect(config.browser.contextOptions).not.toHaveProperty("storageState")
  })
})

describe("playwrightMcpInitPage", () => {
  it("pins every page's clock to the gate's instant", () => {
    const source = playwrightMcpInitPage()
    expect(source).toContain(`setFixedTime(${JSON.stringify(BROWSER_GATE_NOW)})`)
    expect(source).toMatch(/^export default async/m)
  })
})
