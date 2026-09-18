// Derives the release publish set from the workspace graph, so what gets published is exactly what
// gets versioned. The publish set is every non-private publishable workspace under a workspace
// glob (`@plainworks/*` and `create-plainworks`), emitted in dependency order (a package appears after
// every workspace package it depends on) so a consumer never sees a package whose dependencies
// are missing from the registry.
//
// Usage:
//   node scripts/release-publish-set.mjs           # print ordered workspace dirs, one per line
//   node scripts/release-publish-set.mjs --json    # print [{ dir, name, version }, …]
//   node scripts/release-publish-set.mjs --check   # assert the derivation holds; non-zero on drift
//
// The ordering source is the workspace dependency graph the repo already maintains in each
// package.json, never a hand-written list — that list is precisely the failure mode this replaces.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads and parses a JSON file relative to the repo root. */
function readJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
}

/**
 * Expands the root package.json `workspaces` globs into concrete package directories. Only the
 * single-level `dir/*` form the repo uses is supported; a deeper glob would need a real matcher.
 */
function workspaceDirs() {
  const { workspaces } = readJson("package.json");
  const dirs = [];
  for (const pattern of workspaces) {
    if (!pattern.endsWith("/*")) {
      throw new Error(`Unsupported workspace glob: ${pattern}`);
    }
    const base = pattern.slice(0, -2);
    for (const entry of readdirSync(join(repoRoot, base))) {
      const rel = `${base}/${entry}`;
      if (statSync(join(repoRoot, rel)).isDirectory()) dirs.push(rel);
    }
  }
  return dirs;
}

/** Collects every non-private publishable workspace as `{ dir, name, version, deps }`. */
function publishableWorkspaces() {
  const found = [];
  for (const dir of workspaceDirs()) {
    let pkg;
    try {
      pkg = readJson(`${dir}/package.json`);
    } catch {
      continue;
    }
    if (pkg.private) continue;
    if (typeof pkg.name !== "string") continue;
    if (!pkg.name.startsWith("@plainworks/") && pkg.name !== "create-plainworks") continue;
    const deps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ]);
    found.push({ dir, name: pkg.name, version: pkg.version, deps });
  }
  return found;
}

/**
 * Topologically sorts the publishable set so each package follows every publishable package it
 * depends on. Ties break by name for a stable, reviewable order. Throws on a dependency cycle.
 */
function dependencyOrder(workspaces) {
  const byName = new Map(workspaces.map((w) => [w.name, w]));
  const edges = new Map(
    workspaces.map((w) => [w.name, [...w.deps].filter((d) => byName.has(d)).sort()]),
  );
  const ordered = [];
  const state = new Map(); // name → "visiting" | "done"
  const visit = (name, trail) => {
    const status = state.get(name);
    if (status === "done") return;
    if (status === "visiting") {
      throw new Error(`Dependency cycle: ${[...trail, name].join(" → ")}`);
    }
    state.set(name, "visiting");
    for (const dep of edges.get(name)) visit(dep, [...trail, name]);
    state.set(name, "done");
    ordered.push(byName.get(name));
  };
  for (const { name } of [...workspaces].sort((a, b) => a.name.localeCompare(b.name))) {
    visit(name, []);
  }
  return ordered;
}

/** Asserts the derived set covers exactly the publishable workspaces in a valid dependency order. */
function check(workspaces, ordered) {
  const orderedNames = ordered.map((w) => w.name);
  const expected = new Set(workspaces.map((w) => w.name));
  const seen = new Set(orderedNames);
  const missing = [...expected].filter((n) => !seen.has(n));
  const extra = orderedNames.filter((n) => !expected.has(n));
  if (missing.length || extra.length || orderedNames.length !== expected.size) {
    const miss = missing.join(", ") || "none";
    const surplus = extra.join(", ") || "none";
    throw new Error(
      `Publish set does not match publishable workspaces (missing: ${miss}; extra: ${surplus}).`,
    );
  }
  const position = new Map(orderedNames.map((n, i) => [n, i]));
  const byName = new Map(workspaces.map((w) => [w.name, w]));
  for (const name of orderedNames) {
    for (const dep of byName.get(name).deps) {
      if (byName.has(dep) && position.get(dep) > position.get(name)) {
        throw new Error(`${name} is published before its dependency ${dep}.`);
      }
    }
  }
}

const workspaces = publishableWorkspaces();
const ordered = dependencyOrder(workspaces);
const mode = process.argv[2];

if (mode === "--check") {
  check(workspaces, ordered);
  const names = ordered.map((w) => w.name).join(", ");
  process.stderr.write(`Publish set OK — ${ordered.length} packages: ${names}\n`);
} else if (mode === "--json") {
  const entries = ordered.map(({ dir, name, version }) => ({ dir, name, version }));
  process.stdout.write(`${JSON.stringify(entries)}\n`);
} else {
  process.stdout.write(`${ordered.map((w) => w.dir).join("\n")}\n`);
}
