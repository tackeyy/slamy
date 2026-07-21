#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(readOption("--root") ?? "src");
const allowedImports = new Map([
  ["domain", new Set(["domain"])],
  ["workspace", new Set(["workspace", "domain"])],
  ["credentials", new Set(["credentials", "domain", "workspace"])],
  ["targets", new Set(["targets", "domain", "workspace"])],
  ["slack", new Set(["slack", "domain", "workspace", "credentials", "targets"])],
  ["commands", new Set(["commands", "domain", "workspace", "credentials", "targets", "slack"])],
  ["output", new Set(["output", "domain", "commands"])],
  ["events", new Set(["events", "domain", "workspace", "credentials"])],
  [
    "lib",
    new Set([
      "lib",
      "domain",
      "workspace",
      "credentials",
      "targets",
      "slack",
      "commands",
      "events",
    ]),
  ],
  ["cli", new Set(["cli", "lib", "output"])],
]);

const files = await listTypeScriptFiles(root);
const fileSet = new Set(files);
const graph = new Map(files.map((file) => [file, []]));
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const importerModule = moduleName(file);
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith(".")) continue;
    const imported = resolveImport(file, specifier, fileSet);
    if (!imported) continue;
    graph.get(file).push(imported);

    const importedModule = moduleName(imported);
    const allowed = allowedImports.get(importerModule);
    if (allowed && !allowed.has(importedModule)) {
      violations.push(
        `forbidden import: ${display(file)} (${importerModule}) -> ${display(imported)} (${importedModule})`,
      );
    }
  }
}

for (const cycle of findCycles(graph)) {
  violations.push(`dependency cycle: ${cycle.map(display).join(" -> ")}`);
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Architecture check passed (${files.length} source files)\n`);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function listTypeScriptFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      result.push(...(await listTypeScriptFiles(path)));
    } else if (
      entry.isFile() &&
      extname(entry.name) === ".ts" &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      result.push(resolve(path));
    }
  }
  return result.sort();
}

function importSpecifiers(source) {
  const result = [];
  const staticPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicPattern = /import\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) result.push(match[1]);
  }
  return result;
}

function resolveImport(importer, specifier, knownFiles) {
  const raw = resolve(dirname(importer), specifier);
  const candidates = [
    raw,
    raw.endsWith(".js") ? `${raw.slice(0, -3)}.ts` : `${raw}.ts`,
    join(raw, "index.ts"),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate));
}

function moduleName(file) {
  return relative(root, file).split(sep)[0];
}

function display(file) {
  return relative(root, file).split(sep).join("/");
}

function findCycles(dependencies) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const unique = new Set();
  const cycles = [];

  function visit(file) {
    if (active.has(file)) {
      const start = stack.indexOf(file);
      const cycle = [...stack.slice(start), file];
      const key = [...new Set(cycle)].sort().join("|");
      if (!unique.has(key)) {
        unique.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    active.add(file);
    stack.push(file);
    for (const dependency of dependencies.get(file) ?? []) visit(dependency);
    stack.pop();
    active.delete(file);
  }

  for (const file of dependencies.keys()) visit(file);
  return cycles;
}
