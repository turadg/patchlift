import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { hashPatch } from "../core/hashPatch.js";
import { resolvePackage } from "../core/resolutions.js";
import { resolvePatchPath } from "../core/resolvePatchPath.js";
import {
  readSidecar,
  resolveSidecarStatus,
  sidecarPath,
  writeSidecar,
} from "../core/sidecar.js";
import type { SidecarData } from "../core/sidecar.js";

export async function forwardCommand(oldPatch: string, newPatch: string): Promise<void> {
  const oldFile = resolvePatchPath(oldPatch);
  const newFile = resolvePatchPath(newPatch);

  if (oldFile === newFile) {
    throw new Error("Source and target are the same patch.");
  }

  const oldSidecar = await readSidecar(oldFile);
  if (!oldSidecar) {
    throw new Error(`No sidecar for ${basename(oldFile)} — nothing to forward.`);
  }

  const existingNew = await readSidecar(newFile);
  if (existingNew) {
    throw new Error(
      `Sidecar already exists for ${basename(newFile)} (status: ${resolveSidecarStatus(existingNew)}). ` +
        `Remove ${sidecarPath(newFile)} first if you intend to overwrite.`,
    );
  }

  const newPackage = await resolvePackage(newFile);
  if (newPackage.name !== oldSidecar.package.name) {
    console.warn(
      `Warning: package name differs (${oldSidecar.package.name} → ${newPackage.name}). Forwarding anyway.`,
    );
  }

  const newContent = await readFile(newFile, "utf-8");
  const now = new Date().toISOString();

  const sidecar: SidecarData = {
    schemaVersion: 1,
    patchHash: hashPatch(newContent),
    package: newPackage,
    upstream: { ...oldSidecar.upstream },
    status: oldSidecar.status,
    notes: oldSidecar.notes,
    createdAt: oldSidecar.createdAt,
    updatedAt: now,
  };

  await writeSidecar(newFile, sidecar);
  console.log(`✓ Sidecar forwarded: ${sidecarPath(newFile)}`);
}
