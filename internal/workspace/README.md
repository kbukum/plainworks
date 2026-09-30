# @plainworks/workspace

Dev-only, never published. `@plainworks/workspace` is the shared workspace-listing and file-access seam for internal tools, so release, shape, and other repo-wide tooling discover workspaces and parse manifests the same way.

Production CLIs pass `nodeWorkspaceFiles(repoRoot)` to read the real repository. Unit tests pass `memoryWorkspaceFiles()` so they never touch disk.

The `WorkspaceFiles` seam stays small: `readText`, `listDirectories`, `listFiles`, and `writeText`.

`listWorkspaces(files)` reads the root `package.json` `workspaces` array, expands the supported `*` globs, skips directories without a `package.json`, and returns repo-relative workspace directories with their parsed manifests. `readJsonObject(files, path)` is the lower-level helper when a tool needs one manifest or config file.
