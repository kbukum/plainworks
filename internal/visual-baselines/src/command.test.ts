import { describe, expect, it } from "vitest"
import { containerScript, dockerRunArgs, parseBaselineArgs } from "./command"
import { DEFAULT_PLATFORM, PLAYWRIGHT_IMAGE, VISUAL_APPS } from "./config"

describe("parseBaselineArgs", () => {
  it("accepts a visual app and forwards the rest to Playwright", () => {
    expect(parseBaselineArgs(["showcase", "--grep", "chart"], VISUAL_APPS)).toEqual({
      app: "showcase",
      playwrightArgs: ["--grep", "chart"],
    })
  })

  it.each([[[]], [["unknown"]]])("returns the usage line for %j", (argv) => {
    expect(parseBaselineArgs(argv, VISUAL_APPS)).toEqual({
      usage: "Usage: plainworks-visual-baselines <showcase|next-host> [playwright args]",
    })
  })
})

describe("containerScript", () => {
  const script = containerScript({
    app: "next-host",
    packageName: "@plainworks/next-host",
    owner: "501:20",
  })

  it("builds only the app's workspace dependencies", () => {
    expect(script).toContain("bunx turbo run build --filter='@plainworks/next-host^...'")
  })

  it("copies only linux baselines back and hands them to the host user", () => {
    expect(script).toContain("tar -C /src/apps/next-host -xf -")
    expect(script).toContain("chown -R 501:20")
  })

  it("forwards Playwright arguments positionally, never interpolated", () => {
    expect(script).toContain('bunx playwright test --grep @visual "$@"')
  })
})

describe("dockerRunArgs", () => {
  it("mounts the repo into the CI image and appends the Playwright arguments", () => {
    const args = dockerRunArgs({
      repoRoot: "/repo",
      script: "echo",
      playwrightArgs: ["--headed"],
      platform: undefined,
    })
    expect(args).toContain(`--platform=${DEFAULT_PLATFORM}`)
    expect(args).toContain("/repo:/src")
    expect(args.slice(-6)).toEqual([
      PLAYWRIGHT_IMAGE,
      "bash",
      "-c",
      "echo",
      "e2e-linux",
      "--headed",
    ])
  })

  it("honours an explicit platform", () => {
    const args = dockerRunArgs({
      repoRoot: "/r",
      script: "",
      playwrightArgs: [],
      platform: "linux/arm64",
    })
    expect(args).toContain("--platform=linux/arm64")
  })
})
