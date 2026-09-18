import { describe, expect, it } from "vitest"
import { type CommandRunner, detectPackageManager, initGit, installDependencies } from "./finalize"

/** A runner that records the commands it is asked to run instead of spawning a process. */
function recordingRunner(): { runner: CommandRunner; calls: [string, string[], string][] } {
  const calls: [string, string[], string][] = []
  const runner: CommandRunner = (command, args, cwd) => {
    calls.push([command, [...args], cwd])
  }
  return { runner, calls }
}

describe("detectPackageManager", () => {
  it.each([
    ["bun/1.3.6", "bun"],
    ["pnpm/9.0.0 npm/? node/v22", "pnpm"],
    ["yarn/4.1.0 npm/?", "yarn"],
    ["npm/10.2.0 node/v22", "npm"],
  ] as const)("maps user agent %j to %s", (userAgent, expected) => {
    expect(detectPackageManager(userAgent)).toBe(expected)
  })

  it("falls back to npm for a missing or empty user agent", () => {
    const saved = process.env.npm_config_user_agent
    try {
      delete process.env.npm_config_user_agent
      expect(detectPackageManager()).toBe("npm")
      expect(detectPackageManager("")).toBe("npm")
    } finally {
      if (saved === undefined) delete process.env.npm_config_user_agent
      else process.env.npm_config_user_agent = saved
    }
  })
})

describe("installDependencies", () => {
  it("runs `<pm> install` in the project directory", () => {
    const { runner, calls } = recordingRunner()
    installDependencies("/tmp/app", "pnpm", runner)
    expect(calls).toEqual([["pnpm", ["install"], "/tmp/app"]])
  })
})

describe("initGit", () => {
  it("inits, stages, and commits with an inline author identity", () => {
    const { runner, calls } = recordingRunner()
    initGit("/tmp/app", runner)
    expect(calls.map(([command, args]) => [command, args])).toEqual([
      ["git", ["init", "--quiet"]],
      ["git", ["add", "-A"]],
      [
        "git",
        [
          "-c",
          "user.name=create-plainworks",
          "-c",
          "user.email=create-plainworks@users.noreply.github.com",
          "commit",
          "--quiet",
          "--message",
          "Initial commit from create-plainworks",
        ],
      ],
    ])
    // Every command runs in the project directory.
    expect(calls.every(([, , cwd]) => cwd === "/tmp/app")).toBe(true)
  })

  it("supplies the identity before `commit` so it never depends on global Git config", () => {
    const { runner, calls } = recordingRunner()
    initGit("/tmp/app", runner)
    const commit = calls.find(([, args]) => args.includes("commit"))
    expect(commit?.[1].indexOf("user.name=create-plainworks")).toBeLessThan(
      commit?.[1].indexOf("commit") ?? -1,
    )
  })
})
