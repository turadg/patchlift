import { readFile } from "node:fs/promises";
import { resolvePackage } from "../core/resolutions.js";
import { resolveRepo } from "../core/resolveRepo.js";
import { hashPatch } from "../core/hashPatch.js";
import { readSidecar, writeSidecar, sidecarPath } from "../core/sidecar.js";
import { resolvePatchPath } from "../core/resolvePatchPath.js";
import type { SidecarData } from "../core/sidecar.js";

interface UpdateOptions {
  issue?: string;
  pr?: string;
  status?: SidecarData["status"];
  notes?: string;
  clear: boolean;
}

export async function updateCommand(patchFile: string, options: UpdateOptions): Promise<void> {
  patchFile = resolvePatchPath(patchFile);

  const content = await readFile(patchFile, "utf-8");
  const patchHash = hashPatch(content);
  const now = new Date().toISOString();

  if (options.clear) {
    const pkg = await resolvePackage(patchFile);
    const repo = await resolveRepo(pkg.name);

    const sidecar: SidecarData = {
      schemaVersion: 1,
      patchHash,
      package: pkg,
      upstream: {
        repo: repo.full,
        issue: null,
        pr: null,
      },
      status: "untracked",
      notes: null,
      createdAt: now,
      updatedAt: now,
    };

    await writeSidecar(patchFile, sidecar);
    console.log(`✓ Sidecar cleared: ${sidecarPath(patchFile)}`);
    return;
  }

  const existing = await readSidecar(patchFile);
  const pkg = existing?.package ?? (await resolvePackage(patchFile));
  let repo = existing?.upstream?.repo;

  if (!repo) {
    const repoInfo = await resolveRepo(pkg.name);
    repo = repoInfo.full;
  }

  const sidecar: SidecarData = {
    schemaVersion: 1,
    patchHash,
    package: pkg,
    upstream: {
      repo,
      issue: options.issue !== undefined ? options.issue : (existing?.upstream?.issue ?? null),
      pr: options.pr !== undefined ? options.pr : (existing?.upstream?.pr ?? null),
    },
    status: options.status ?? existing?.status ?? "untracked",
    notes: options.notes !== undefined ? options.notes : (existing?.notes ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  // If issue is provided and status not explicitly set, promote to proposed
  if (options.issue && !options.status && (!existing?.status || existing.status === "untracked")) {
    sidecar.status = "proposed";
  }

  await writeSidecar(patchFile, sidecar);
  console.log(`✓ Sidecar updated: ${sidecarPath(patchFile)}`);
}
