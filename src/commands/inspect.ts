import { readdir, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { existsSync } from "node:fs";
import { inferPackage } from "../core/inferPackage.js";
import { readSidecar, resolveSidecarStatus } from "../core/sidecar.js";
import { resolvePatchPath } from "../core/resolvePatchPath.js";
import { hashPatch } from "../core/hashPatch.js";
import { detectPatchLayout } from "../core/patchLayout.js";
import { loadResolutions, buildChainMap } from "../core/resolutions.js";
import type { ChainEntry } from "../core/resolutions.js";

interface InspectOptions {
  json: boolean;
  verbose: boolean;
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

  const resolvedPatch = patchFile ? resolvePatchPath(patchFile) : undefined;
  const searchStart = resolvedPatch ? dirname(resolvedPatch) : process.cwd();
  const resolutions = await loadResolutions(searchStart);
  const chainMap = buildChainMap(resolutions);

  if (resolvedPatch) {
    patches.push(await inspectPatch(resolvedPatch, chainMap));
  } else {
    const layout = detectPatchLayout();
    if (!layout || !existsSync(layout.patchDir)) {
      console.log("No supported patch directory found.");
      return;
    }
    const files = await readdir(layout.patchDir);
    const patchFiles = files
      .filter((f) => f.endsWith(".patch"))
      .map((f) => join(layout.patchDir, f));

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
