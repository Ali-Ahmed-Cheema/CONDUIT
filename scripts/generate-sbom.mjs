import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootManifest = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const nodeDir = dirname(process.execPath);
const npmCliPath = [
  process.env.npm_execpath,
  join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
  resolve(nodeDir, "../lib/node_modules/npm/bin/npm-cli.js"),
].find((candidate) => candidate && existsSync(candidate) && candidate.endsWith("npm-cli.js"));

if (!npmCliPath) {
  throw new Error("Unable to locate the npm CLI required to scan the pnpm installation.");
}

function findWorkspacePackages() {
  const packages = [];

  for (const workspaceDir of ["apps", "packages"]) {
    const workspaceRoot = join(rootDir, workspaceDir);
    if (!existsSync(workspaceRoot)) continue;

    for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const packageDir = join(workspaceRoot, entry.name);
      const manifestPath = join(packageDir, "package.json");
      if (!existsSync(manifestPath)) continue;

      packages.push({
        dir: packageDir,
        manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
      });
    }
  }

  return packages;
}

function packageRef(name, version) {
  return `${rootManifest.name}@${rootManifest.version}|${name}@${version}`;
}

function findComponentByRefSuffix(components, suffix) {
  for (const component of components) {
    if (component["bom-ref"]?.endsWith(suffix)) return component;
    const nested = findComponentByRefSuffix(component.components ?? [], suffix);
    if (nested) return nested;
  }
  return undefined;
}

function collectComponentRefs(components, refs) {
  for (const component of components) {
    if (component["bom-ref"]) refs.add(component["bom-ref"]);
    collectComponentRefs(component.components ?? [], refs);
  }
}

function resolveInstalledPackage(startDir, dependencyName) {
  let currentDir = resolve(startDir);
  while (true) {
    const manifestPath = join(currentDir, "node_modules", ...dependencyName.split("/"), "package.json");
    if (existsSync(manifestPath)) return realpathSync(manifestPath);

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
}

function addWorkspacePackages(bom, workspaces) {
  const componentRefs = new Map();
  const components = new Map(bom.components.map((component) => [component["bom-ref"], component]));
  const workspaceRefs = new Map();
  const dependencyMap = new Map(
    bom.dependencies.map((dependency) => [dependency.ref, new Set(dependency.dependsOn ?? [])]),
  );

  for (const workspace of workspaces) {
    const { name, version } = workspace.manifest;
    if (!name || !version) {
      throw new Error(`Workspace package at ${relative(rootDir, workspace.dir)} needs a name and version.`);
    }
    const ref = packageRef(name, version);
    workspaceRefs.set(name, ref);
    componentRefs.set(`${name}@${version}`, ref);
    components.set(ref, {
      type: "library",
      name,
      version,
      "bom-ref": ref,
      purl: `pkg:npm/${name.startsWith("@") ? `%40${name.slice(1)}` : name}@${version}`,
    });
  }

  function ensureComponentRef(manifest) {
    const key = `${manifest.name}@${manifest.version}`;
    if (componentRefs.has(key)) return componentRefs.get(key);

    const existing = findComponentByRefSuffix(bom.components, `|${key}`);
    if (existing) {
      componentRefs.set(key, existing["bom-ref"]);
      return existing["bom-ref"];
    }

    const ref = `pkg:npm/${manifest.name.startsWith("@") ? `%40${manifest.name.slice(1)}` : manifest.name}@${manifest.version}`;
    const license =
      typeof manifest.license === "string"
        ? manifest.license
        : manifest.license?.type ?? manifest.license?.name;
    components.set(ref, {
      type: "library",
      name: manifest.name,
      version: manifest.version,
      "bom-ref": ref,
      purl: ref,
      ...(license
        ? {
            licenses: [
              {
                license: /^[A-Za-z0-9.+-]+$/.test(license) ? { id: license } : { name: license },
              },
            ],
          }
        : {}),
    });
    componentRefs.set(key, ref);
    return ref;
  }

  const visited = new Set();
  function addPackageDependencies(manifest, packageDir, ref, includeDevDependencies = false) {
    if (visited.has(ref)) return;
    visited.add(ref);

    const dependencyNames = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...(includeDevDependencies ? Object.keys(manifest.devDependencies ?? {}) : []),
    ]);
    const optionalNames = new Set([
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.entries(manifest.peerDependenciesMeta ?? {})
        .filter(([, metadata]) => metadata.optional)
        .map(([name]) => name),
    ]);
    const dependsOn = dependencyMap.get(ref) ?? new Set();

    for (const dependencyName of dependencyNames) {
      const localRef = workspaceRefs.get(dependencyName);
      if (localRef) {
        dependsOn.add(localRef);
        continue;
      }

      const manifestPath = resolveInstalledPackage(packageDir, dependencyName);
      if (!manifestPath) {
        if (optionalNames.has(dependencyName) || manifest.peerDependencies?.[dependencyName]) continue;
        throw new Error(`Missing installed dependency ${dependencyName} for ${manifest.name}@${manifest.version}.`);
      }

      const dependencyManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!dependencyManifest.name || !dependencyManifest.version) {
        throw new Error(`Invalid package manifest for dependency ${dependencyName}.`);
      }
      const dependencyRef = ensureComponentRef(dependencyManifest);
      dependsOn.add(dependencyRef);
      addPackageDependencies(
        dependencyManifest,
        dirname(manifestPath),
        dependencyRef,
      );
    }

    dependencyMap.set(ref, dependsOn);
  }

  for (const workspace of workspaces) {
    const { manifest, dir } = workspace;
    addPackageDependencies(
      manifest,
      dir,
      workspaceRefs.get(manifest.name),
      true,
    );
  }

  addPackageDependencies(rootManifest, rootDir, rootManifest.name + "@" + rootManifest.version, true);
  bom.components = [...components.values()];
  bom.dependencies = [...dependencyMap].map(([ref, dependsOn]) => ({
    ref,
    dependsOn: [...dependsOn].sort(),
  }));

  const knownRefs = new Set([bom.metadata?.component?.["bom-ref"]]);
  collectComponentRefs(bom.components, knownRefs);
  for (const dependency of bom.dependencies) {
    if (!knownRefs.has(dependency.ref) || dependency.dependsOn.some((ref) => !knownRefs.has(ref))) {
      throw new Error(`SBOM dependency graph contains an unresolved component reference at ${dependency.ref}.`);
    }
  }
}

const workspaces = findWorkspacePackages();
const tempDir = mkdtempSync(join(tmpdir(), "conduit-sbom-"));
const tempFile = join(tempDir, "bom.json");

try {
  execFileSync(
    process.execPath,
    [
      npmCliPath,
      "exec",
      "--",
      "cyclonedx-npm",
      "--ignore-npm-errors",
      "--output-format",
      "JSON",
      "--output-file",
      tempFile,
    ],
    {
      cwd: rootDir,
      env: { ...process.env, npm_execpath: npmCliPath },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: "ignore",
    },
  );

  const bom = JSON.parse(readFileSync(tempFile, "utf8"));
  if (!Array.isArray(bom.components) || !Array.isArray(bom.dependencies)) {
    throw new Error("CycloneDX generator returned an incomplete BOM.");
  }

  addWorkspacePackages(bom, workspaces);
  writeFileSync(join(rootDir, "sbom.json"), `${JSON.stringify(bom, null, 2)}\n`);
  console.log(
    `Generated CycloneDX SBOM with ${bom.components.length} components, including ${workspaces.length} workspace packages.`,
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`SBOM generation failed: ${detail}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
