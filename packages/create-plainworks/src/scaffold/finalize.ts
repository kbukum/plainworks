// The side-effecting tail of a scaffold: install dependencies and initialize a git repo. Both are
// thin, optional wrappers over the host toolchain (skipped by `--no-install`/`--no-git`), driven
// by an injected command runner so the exact commands are unit-testable and no process spawns from
// this module — the `bin` supplies the real runner. Package-manager detection is pure.

/** A supported package manager. */
export type PackageManager = "bun" | "pnpm" | "yarn" | "npm"

/** Spawn a command in a working directory. Injected so the helpers below stay pure and testable. */
export type CommandRunner = (command: string, args: readonly string[], cwd: string) => void

/**
 * Detect the package manager that launched the initializer from the `npm_config_user_agent` the
 * runner sets (`bunx`, `npm create`, `pnpm dlx`, `yarn create`). Falls back to `npm`.
 */
export function detectPackageManager(
  userAgent: string | undefined = process.env.npm_config_user_agent,
): PackageManager {
  if (userAgent === undefined || userAgent === "") return "npm"
  if (userAgent.startsWith("bun")) return "bun"
  if (userAgent.startsWith("pnpm")) return "pnpm"
  if (userAgent.startsWith("yarn")) return "yarn"
  return "npm"
}

/** Run `<pm> install` in the generated project directory. */
export function installDependencies(
  dir: string,
  packageManager: PackageManager,
  run: CommandRunner,
): void {
  run(packageManager, ["install"], dir)
}

/**
 * Initialize a git repository in the generated project with one initial commit. The commit carries
 * an inline author identity (`git -c user.name/user.email`) so it succeeds on a fresh machine or in
 * a container where no global Git identity is configured, rather than the scaffold failing at the
 * end.
 */
export function initGit(dir: string, run: CommandRunner): void {
  run("git", ["init", "--quiet"], dir)
  run("git", ["add", "-A"], dir)
  run(
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
    dir,
  )
}
