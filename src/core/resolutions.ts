import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { inferPackage } from "./inferPackage.js";
import type { PackageInfo } from "./inferPackage.js";

export interface ChainEntry {
  name: string;
  version: string;
  chain: string[];
  indexInChain: number;
}

// Iteratively URL-decode until stable. Yarn wraps each patch-of-a-patch layer in
// another round of percent-encoding, so a 3-layer chain needs 3 decodes to expose
// the innermost `npm:<version>`.
function decodeFully(s: string): string {
  let prev = s;
  for (let i = 0; i < 6; i++) {
    let next: string;
    try {
      next = decodeURIComponent(prev);
    } catch {
      return prev;
    }
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

// Resolution keys are "<name>@<descriptor>", e.g. "@endo/pass-style@npm:^1.6.3".
// The package name is everything before the last `@` that isn't at position 0.
function extractPackageName(resolutionKey: string): string {
  const lastAt = resolutionKey.lastIndexOf("@");
  return lastAt > 0 ? resolutionKey.slice(0, lastAt) : resolutionKey;
}

function extractBaseVersion(decodedValue: string): string | null {
  const m = decodedValue.match(/npm:(\d+\.\d+\.\d+[^#?&:\s]*)/);
  return m ? m[1] : null;
}

function extractPatchChain(decodedValue: string): string[] {
  const re = /\.yarn\/patches\/([^#:?\s]+\.patch)/g;
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(decodedValue)) !== null) result.push(m[1]);
  return result;
}

export async function loadResolutions(startDir: string): Promise<Record<string, string>> {
  let dir = startDir;
  while (true) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        if (pkg?.resolutions && typeof pkg.resolutions === "object") {
          return pkg.resolutions as Record<string, string>;
        }
      } catch {
        // fall through and keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}

export function buildChainMap(resolutions: Record<string, string>): Map<string, ChainEntry> {
  const map = new Map<string, ChainEntry>();
  for (const [key, value] of Object.entries(resolutions)) {
    if (typeof value !== "string" || !value.includes(".yarn/patches/")) continue;

    const decoded = decodeFully(value);
    const chain = extractPatchChain(decoded);
    if (chain.length === 0) continue;

    const name = extractPackageName(key);
    const version = extractBaseVersion(decoded) ?? "?";

    chain.forEach((patchBasename, idx) => {
      // A patch may be referenced by multiple resolutions (different descriptors
      // pointing at the same chain); prefer the entry with the deepest chain so
      // layer counts reflect reality.
      const existing = map.get(patchBasename);
      if (!existing || chain.length > existing.chain.length) {
        map.set(patchBasename, { name, version, chain, indexInChain: idx });
      }
    });
  }
  return map;
}

/**
 * Identify a patch's package via the root `package.json`'s `resolutions` field,
 * falling back to filename parsing. Necessary because filenames like
 * `@lerna-lite-version-npm-4.6.1-…` are ambiguous (scope could be `@lerna` or
 * `@lerna-lite`) — only the resolution key carries the canonical form.
 */
export async function resolvePackage(patchFile: string): Promise<PackageInfo> {
  const resolutions = await loadResolutions(dirname(patchFile));
  const entry = buildChainMap(resolutions).get(basename(patchFile));
  if (entry) return { name: entry.name, version: entry.version };
  return inferPackage(patchFile);
}
