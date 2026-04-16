import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Accept either a path (relative/absolute) or a bare filename that lives inside
 * `.yarn/patches/` of the current working directory. The literal argument wins
 * when it exists so users never get second-guessed on an unambiguous input.
 * Throws with the original argument preserved in the message.
 */
export function resolvePatchPath(patchFile: string): string {
  if (existsSync(patchFile)) return patchFile;
  const inYarn = join(process.cwd(), ".yarn", "patches", patchFile);
  if (existsSync(inYarn)) return inYarn;
  throw new Error(`Patch file not found: ${patchFile}`);
}
