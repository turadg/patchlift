import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const STATUSES = [
  "untracked",
  "proposed",
  "merged",
  "rejected",
  "localonly",
  "obsolete",
] as const;
export type Status = (typeof STATUSES)[number];

export interface SidecarData {
  schemaVersion: 1;
  patchFile: string;
  patchHash: string;
  package: {
    name: string;
    version: string;
  };
  upstream: {
    repo: string;
    issue: string | null;
    pr: string | null;
  };
  status: Status;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function sidecarPath(patchFile: string): string {
  return `${patchFile}.patchlift.json`;
}

export async function readSidecar(patchFile: string): Promise<SidecarData | null> {
  const path = sidecarPath(patchFile);
  if (!existsSync(path)) return null;
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as SidecarData;
  } catch (err) {
    throw new Error(`Failed to read sidecar at ${path}: ${(err as Error).message}`);
  }
}

export async function writeSidecar(patchFile: string, data: SidecarData): Promise<void> {
  const path = sidecarPath(patchFile);
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function resolveSidecarStatus(sidecar: SidecarData | null): SidecarData["status"] {
  if (!sidecar) return "untracked";
  if (sidecar.status) return sidecar.status;
  if (sidecar.upstream?.issue) return "proposed";
  return "untracked";
}
