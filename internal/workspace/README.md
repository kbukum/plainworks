# @plainworks/workspace

Shared workspace-listing and file-access seam for internal tools. Release and shape both use it so workspace discovery, manifest parsing, and in-memory tests stay consistent.

Use `listWorkspaces(files)` to read the Bun workspace graph from a `WorkspaceFiles` implementation. Production tools pass `nodeWorkspaceFiles(repoRoot)`, and unit tests use `memoryWorkspaceFiles()` so they never touch the real filesystem.
