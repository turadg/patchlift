import { readdir, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { existsSync } from "node:fs";
import { inferPackage } from "../core/inferPackage.js";
import { readSidecar, resolveSidecarStatus } from "../core/sidecar.js";

interface InspectOptions {
  json: boolean;
  verbose: boolean;
}

interface ChainEntry {
  name: string;
  version: string;
  chain: string[];
  indexInChain: number;
}

interface PatchSummary {
  patchFile: string;
  package: { name: string; version: string } | null;
  status: string;
  issue: string | null;
  drift: boolean;
  sidecar: object | null;
  chain: { index: number; total: number; leader: string } | null;
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

async function loadResolutions(startDir: string): Promise<Record<string, string>> {
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

function buildChainMap(resolutions: Record<string, string>): Map<string, ChainEntry> {
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

async function inspectPatch(
  patchFile: string,
  chainMap: Map<string, ChainEntry>,
): Promise<PatchSummary> {
  let pkg: { name: string; version: string } | null = null;
  let chain: { index: number; total: number; leader: string } | null = null;

  const entry = chainMap.get(basename(patchFile));
  if (entry) {
    pkg = { name: entry.name, version: entry.version };
    if (entry.chain.length > 1) {
      chain = {
        index: entry.indexInChain,
        total: entry.chain.length,
        leader: entry.chain[0],
      };
    }
  } else {
    try {
      pkg = inferPackage(patchFile);
    } catch {
      // Could not infer package
    }
  }

  const sidecar = await readSidecar(patchFile);
  const status = resolveSidecarStatus(sidecar);

  let drift = false;
  if (sidecar) {
    try {
      const content = await readFile(patchFile, "utf-8");
      const currentHash = hashPatch(content);
      drift = currentHash !== sidecar.patchHash;
    } catch {
      // Could not check drift
    }
  }

  return {
    patchFile,
    package: pkg,
    status,
    issue: sidecar?.upstream?.issue ?? null,
    drift,
    sidecar: sidecar as object | null,
    chain,
  };
}

export async function inspectCommand(
  patchFile: string | undefined,
  options: InspectOptions,
): Promise<void> {
  const patches: PatchSummary[] = [];
  const searchStart = patchFile ? dirname(patchFile) : process.cwd();
  const resolutions = await loadResolutions(searchStart);
  const chainMap = buildChainMap(resolutions);

  if (patchFile) {
    if (!existsSync(patchFile)) {
      throw new Error(`Patch file not found: ${patchFile}`);
    }
    patches.push(await inspectPatch(patchFile, chainMap));
  } else {
    // Scan .yarn/patches
    const patchDir = join(process.cwd(), ".yarn", "patches");
    if (!existsSync(patchDir)) {
      console.log("No .yarn/patches directory found.");
      return;
    }
    const files = await readdir(patchDir);
    const patchFiles = files.filter((f) => f.endsWith(".patch")).map((f) => join(patchDir, f));

    for (const file of patchFiles) {
      patches.push(await inspectPatch(file, chainMap));
    }
  }

  if (patches.length === 0) {
    console.log("No patch files found.");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(patches, null, 2));
    return;
  }

  // Sort patches so chain members stick together and render in layer order.
  patches.sort((a, b) => {
    const [ak, ai] = a.chain ? [a.chain.leader, a.chain.index] : [basename(a.patchFile), 0];
    const [bk, bi] = b.chain ? [b.chain.leader, b.chain.index] : [basename(b.patchFile), 0];
    if (ak !== bk) return ak < bk ? -1 : 1;
    return ai - bi;
  });

  // Table output
  const headers = ["PATCH", "PACKAGE", "VERSION", "STATUS", "ISSUE"];
  const renderPatchCell = (p: PatchSummary): string => {
    const name = basename(p.patchFile);
    if (!p.chain || p.chain.index === 0) return name;
    return `${" ".repeat(p.chain.index * 2)}↳ ${name}`;
  };
  const rows = patches.map((p) => [
    renderPatchCell(p),
    p.package?.name ?? "?",
    p.package?.version ?? "?",
    p.status,
    p.issue ? p.issue.replace(/.*\/issues\//, "#") : "-",
  ]);

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const format = (cells: string[]): string =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join("  ");

  const headerLine = format(headers);
  console.log(headerLine);
  console.log("-".repeat(headerLine.length));

  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    console.log(format(rows[i]));

    if (p.drift) {
      const pad = " ".repeat((p.chain?.index ?? 0) * 2);
      console.log(`${pad}  ⚠ patch changed since sidecar was created`);
    }

    if (options.verbose && p.sidecar) {
      console.log(JSON.stringify(p.sidecar, null, 4));
    }
  }
}
