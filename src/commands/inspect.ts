import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { inferPackage } from '../core/inferPackage.js';
import { readSidecar, resolveSidecarStatus } from '../core/sidecar.js';

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
}

async function inspectPatch(patchFile: string): Promise<PatchSummary> {
  let pkg: { name: string; version: string } | null = null;
  try {
    pkg = inferPackage(patchFile);
  } catch {
    // Could not infer package
  }

  const sidecar = await readSidecar(patchFile);
  const status = resolveSidecarStatus(sidecar);

  let drift = false;
  if (sidecar) {
    try {
      const content = await readFile(patchFile, 'utf-8');
      const { hashPatch: hash } = await import('../core/hashPatch.js');
      const currentHash = hash(content);
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
  };
}

export async function inspectCommand(
  patchFile: string | undefined,
  options: InspectOptions,
): Promise<void> {
  const patches: PatchSummary[] = [];

  if (patchFile) {
    if (!existsSync(patchFile)) {
      throw new Error(`Patch file not found: ${patchFile}`);
    }
    patches.push(await inspectPatch(patchFile));
  } else {
    // Scan .yarn/patches
    const patchDir = join(process.cwd(), '.yarn', 'patches');
    if (!existsSync(patchDir)) {
      console.log('No .yarn/patches directory found.');
      return;
    }
    const files = await readdir(patchDir);
    const patchFiles = files
      .filter((f) => f.endsWith('.patch'))
      .map((f) => join(patchDir, f));

    for (const file of patchFiles) {
      patches.push(await inspectPatch(file));
    }
  }

  if (patches.length === 0) {
    console.log('No patch files found.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(patches, null, 2));
    return;
  }

  // Table output
  const PATCH_COL = 30;
  const PKG_COL = 20;
  const VER_COL = 10;
  const STATUS_COL = 12;

  const header = [
    'PATCH'.padEnd(PATCH_COL),
    'PACKAGE'.padEnd(PKG_COL),
    'VERSION'.padEnd(VER_COL),
    'STATUS'.padEnd(STATUS_COL),
    'ISSUE',
  ].join('  ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const p of patches) {
    const name = basename(p.patchFile);
    const pkgName = p.package?.name ?? '?';
    const pkgVersion = p.package?.version ?? '?';
    const issueDisplay = p.issue ? p.issue.replace(/.*\/issues\//, '#') : '-';

    const row = [
      name.padEnd(PATCH_COL),
      pkgName.padEnd(PKG_COL),
      pkgVersion.padEnd(VER_COL),
      p.status.padEnd(STATUS_COL),
      issueDisplay,
    ].join('  ');

    console.log(row);

    if (p.drift) {
      console.log('  ⚠ patch changed since sidecar was created');
    }

    if (options.verbose && p.sidecar) {
      console.log(JSON.stringify(p.sidecar, null, 4));
    }
  }
}
