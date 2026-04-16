import { readFile } from "node:fs/promises";
import { parsePatch } from "../core/parsePatch.js";
import { resolvePackage } from "../core/resolutions.js";
import { resolveRepo } from "../core/resolveRepo.js";
import { hashPatch } from "../core/hashPatch.js";
import { readSidecar, writeSidecar, sidecarPath } from "../core/sidecar.js";
import { buildIssue } from "../core/buildIssue.js";
import { resolvePatchPath } from "../core/resolvePatchPath.js";
import type { SidecarData } from "../core/sidecar.js";

interface IssueOptions {
  title?: string;
  summary?: string;
  web: boolean;
  print: boolean;
  issue?: string;
  dryRun: boolean;
}

export async function issueCommand(patchFile: string, options: IssueOptions): Promise<void> {
  patchFile = resolvePatchPath(patchFile);

  const content = await readFile(patchFile, "utf-8");
  const patchInfo = parsePatch(content);
  const packageInfo = await resolvePackage(patchFile);
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
      patchHash,
      package: packageInfo,
      upstream: {
        repo: repoInfo.full,
        issue: options.issue ?? existing?.upstream?.issue ?? null,
        pr: existing?.upstream?.pr ?? null,
      },
      status: options.issue ? "proposed" : (existing?.status ?? "untracked"),
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await writeSidecar(patchFile, sidecar);
    console.log(`✓ Sidecar updated: ${sidecarPath(patchFile)}`);
  }

  if (options.web && !options.dryRun) {
    const repoUrl = `https://github.com/${repoInfo.full}`;
    const issueUrl = `${repoUrl}/issues/new?title=${encodeURIComponent(issueContent.title)}&body=${encodeURIComponent(issueContent.body)}`;
    const { default: open } = await import("open");
    await open(issueUrl);
    console.log(`✓ Opened issue draft in browser`);
  }
}
