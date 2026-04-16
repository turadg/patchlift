import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectPatchLayout, patchDirCandidates } from "./patchLayout.js";

/**
 * Accept either a path (relative/absolute) or a bare filename that lives inside
 * a supported patch directory in the current working directory. The literal
 * argument wins when it exists so users never get second-guessed on an
 * unambiguous input. Throws with the original argument preserved in the message.
 */
export function resolvePatchPath(patchFile: string): string {
  if (existsSync(patchFile)) return patchFile;

  const layout = detectPatchLayout();
  if (layout) {
    const resolved = join(layout.patchDir, patchFile);
    if (existsSync(resolved)) return resolved;
  }

  for (const patchDir of patchDirCandidates()) {
    const resolved = join(patchDir, patchFile);
    if (existsSync(resolved)) return resolved;
  }

  throw new Error(`Patch file not found: ${patchFile}`);
}
