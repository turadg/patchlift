import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { detectPatchLayout, sidecarPathForPatchFile } from "../core/patchLayout.js";
import { resolvePatchPath } from "../core/resolvePatchPath.js";

describe("patch layout", () => {
  beforeEach(async () => {
    await rm(".yarn", { recursive: true, force: true });
    await rm("patches", { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(".yarn", { recursive: true, force: true });
    await rm("patches", { recursive: true, force: true });
  });

  it("detects yarn patch layout", async () => {
    await mkdir(".yarn/patches", { recursive: true });
    const layout = detectPatchLayout();
    expect(layout?.patchDir).toBe(`${process.cwd()}/.yarn/patches`);
    expect(layout?.sidecarDir).toBe(`${process.cwd()}/.yarn/patches/.patchlift`);
  });

  it("detects patches directory for pnpm and patch-package", async () => {
    await mkdir("patches", { recursive: true });
    const layout = detectPatchLayout();
    expect(layout?.patchDir).toBe(`${process.cwd()}/patches`);
    expect(layout?.sidecarDir).toBe(`${process.cwd()}/patches/.patchlift`);
  });

  it("resolves bare patch filenames from supported layouts", async () => {
    await mkdir("patches", { recursive: true });
    await writeFile("patches/pkg+1.0.0.patch", "patch content");
    expect(resolvePatchPath("pkg+1.0.0.patch")).toBe(`${process.cwd()}/patches/pkg+1.0.0.patch`);
  });

  it("builds sidecar paths next to patches", () => {
    expect(sidecarPathForPatchFile(`${process.cwd()}/patches/pkg.patch`)).toBe(
      `${process.cwd()}/patches/.patchlift/pkg.yml`,
    );
  });
});
