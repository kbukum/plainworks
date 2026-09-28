import { execFile } from "node:child_process"
import { UiCaptureError } from "./errors"

/** Run `git` with `args` and resolve its standard output. Rejects when git exits non-zero. */
export type GitRunner = (
  args: readonly string[],
  options?: { readonly cwd?: string; readonly signal?: AbortSignal },
) => Promise<string>

// A git call that runs longer than this is stuck, such as on a lock or a credential prompt.
const GIT_TIMEOUT_MS = 60_000
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024

/** The real git, in the working directory by default. Output is capped and each call timed out. */
export const nodeGitRunner: GitRunner = (args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: GIT_OUTPUT_LIMIT,
        timeout: GIT_TIMEOUT_MS,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        if (error === null) resolve(stdout)
        else reject(new Error(stderr.trim() || error.message, { cause: error }))
      },
    )
  })

/** The commit HEAD shares with `ref`, where a branch's changes start. */
export async function mergeBaseWith(git: GitRunner, ref: string): Promise<string> {
  try {
    return (await git(["merge-base", "HEAD", ref])).trim()
  } catch (cause) {
    throw new UiCaptureError(
      "git",
      `Could not find where HEAD branched from "${ref}". Fetch it (git fetch origin), or pass another --base.`,
      { cause },
    )
  }
}

/**
 * Every repository-relative path that differs from `commit`: committed since it, staged, unstaged,
 * and untracked but not ignored. A rename counts as both paths.
 */
export async function changedFilesSince(git: GitRunner, commit: string): Promise<string[]> {
  try {
    const tracked = await git(["diff", "--name-only", "--no-renames", "-z", commit])
    const untracked = await git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "--full-name",
      "-z",
      "--",
      ":/",
    ])
    const files = new Set([...split(tracked), ...split(untracked)])
    return [...files].sort()
  } catch (cause) {
    throw new UiCaptureError("git", `Could not list the files changed since ${commit}`, { cause })
  }
}

const split = (output: string): string[] => output.split("\0").filter((path) => path !== "")
