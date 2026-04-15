import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { inferPackage } from '../core/inferPackage.js';
import { resolveRepo } from '../core/resolveRepo.js';
import { hashPatch } from '../core/hashPatch.js';
import { readSidecar, writeSidecar } from '../core/sidecar.js';
import type { SidecarData } from '../core/sidecar.js';

interface UpdateOptions {
  issue?: string;
  pr?: string;
  status?: SidecarData['status'];
  notes?: string;
  clear: boolean;
}

export async function updateCommand(patchFile: string, options: UpdateOptions): Promise<void> {
  if (!existsSync(patchFile)) {
    throw new Error(`Patch file not found: ${patchFile}`);
  }

  const content = await readFile(patchFile, 'utf-8');
  const patchHash = hashPatch(content);
  const now = new Date().toISOString();

  if (options.clear) {
    const pkg = inferPackage(patchFile);
    const repo = await resolveRepo(pkg.name);

    const sidecar: SidecarData = {
      schemaVersion: 1,
      patchFile,
      patchHash,
      package: pkg,
      upstream: {
        repo: repo.full,
        issue: null,
        pr: null,
      },
      status: 'untracked',
      notes: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSidecar(patchFile, sidecar);
    console.log(`✓ Sidecar cleared: ${patchFile}.patchlift.json`);
    return;
  }

  const existing = await readSidecar(patchFile);
  let repo = existing?.upstream?.repo;

  if (!repo) {
    const pkg = inferPackage(patchFile);
    const repoInfo = await resolveRepo(pkg.name);
    repo = repoInfo.full;
  }

  const pkg = (() => {
    if (existing?.package) return existing.package;
    return inferPackage(patchFile);
  })();

  const sidecar: SidecarData = {
    schemaVersion: 1,
    patchFile,
    patchHash,
    package: pkg,
    upstream: {
      repo,
      issue: options.issue !== undefined ? options.issue : (existing?.upstream?.issue ?? null),
      pr: options.pr !== undefined ? options.pr : (existing?.upstream?.pr ?? null),
    },
    status: options.status ?? existing?.status ?? 'untracked',
    notes: options.notes !== undefined ? options.notes : (existing?.notes ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // If issue is provided and status not explicitly set, promote to proposed
  if (options.issue && !options.status && (!existing?.status || existing.status === 'untracked')) {
    sidecar.status = 'proposed';
  }

  await writeSidecar(patchFile, sidecar);
  console.log(`✓ Sidecar updated: ${patchFile}.patchlift.json`);
}
