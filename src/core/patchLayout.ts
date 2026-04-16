import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface PatchLayout {
  patchDir: string;
  sidecarDir: string;
}

const PATCH_DIR_CANDIDATES = [join(".yarn", "patches"), join("patches")] as const;

function sidecarDirForPatchDir(patchDir: string): string {
  return join(patchDir, ".patchlift");
}

export function patchDirCandidates(cwd = process.cwd()): string[] {
  return PATCH_DIR_CANDIDATES.map((relativePath) => join(cwd, relativePath));
}

export function detectPatchLayout(startDir = process.cwd()): PatchLayout | null {
  for (const patchDir of patchDirCandidates(startDir)) {
    if (existsSync(patchDir)) {
      return { patchDir, sidecarDir: sidecarDirForPatchDir(patchDir) };
    }
  }
  return null;
}

export function layoutForPatchFile(patchFile: string): PatchLayout {
  const patchDir = dirname(patchFile);
  return { patchDir, sidecarDir: sidecarDirForPatchDir(patchDir) };
}

export function sidecarPathForPatchFile(patchFile: string): string {
  const { sidecarDir } = layoutForPatchFile(patchFile);
  return join(sidecarDir, `${basename(patchFile, ".patch")}.yml`);
}
