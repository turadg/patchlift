import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parsePatch } from '../core/parsePatch.js';
import { inferPackage } from '../core/inferPackage.js';
import { resolveRepo } from '../core/resolveRepo.js';
import { hashPatch } from '../core/hashPatch.js';
import { readSidecar, writeSidecar } from '../core/sidecar.js';
import { buildIssue } from '../core/buildIssue.js';
import type { SidecarData } from '../core/sidecar.js';

interface IssueOptions {
  title?: string;
  summary?: string;
  web: boolean;
  print: boolean;
  issue?: string;
  dryRun: boolean;
}

export async function issueCommand(patchFile: string, options: IssueOptions): Promise<void> {
  if (!existsSync(patchFile)) {
    throw new Error(`Patch file not found: ${patchFile}`);
  }

  const content = await readFile(patchFile, 'utf-8');
  const patchInfo = parsePatch(content);
  const packageInfo = inferPackage(patchFile);
  const repoInfo = await resolveRepo(packageInfo.name);
  const patchHash = hashPatch(content);

  const issueContent = buildIssue(patchInfo, packageInfo, repoInfo, {
    title: options.title,
    summary: options.summary,
  });

  if (options.print) {
    console.log(`# ${issueContent.title}\n\n${issueContent.body}`);
  }

  if (!options.dryRun) {
    const existing = await readSidecar(patchFile);
    const now = new Date().toISOString();

    const sidecar: SidecarData = {
      schemaVersion: 1,
      patchFile,
      patchHash,
      package: packageInfo,
      upstream: {
        repo: repoInfo.full,
        issue: options.issue ?? existing?.upstream?.issue ?? null,
        pr: existing?.upstream?.pr ?? null,
      },
      status: options.issue ? 'proposed' : (existing?.status ?? 'untracked'),
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await writeSidecar(patchFile, sidecar);
    console.log(`✓ Sidecar updated: ${patchFile}.patchlift.json`);
  }

  if (options.web && !options.dryRun) {
    const repoUrl = `https://github.com/${repoInfo.full}`;
    const issueUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueContent.title)}&body=${encodeURIComponent(issueContent.body)}`;
    const { default: open } = await import('open');
    await open(issueUrl);
    console.log(`✓ Opened issue draft in browser`);
  }
}
