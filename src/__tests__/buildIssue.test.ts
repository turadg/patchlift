import { describe, it, expect } from "vite-plus/test";
import { buildIssue } from "../core/buildIssue.js";
import type { PatchInfo } from "../core/parsePatch.js";
import type { PackageInfo } from "../core/inferPackage.js";
import type { RepoInfo } from "../core/resolveRepo.js";

const patchInfo: PatchInfo = {
  files: ["src/index.js"],
  additions: 2,
  deletions: 1,
  rawContent: "diff --git a/src/index.js ...",
};

const packageInfo: PackageInfo = {
  name: "lodash",
  version: "4.17.21",
};

const repoInfo: RepoInfo = {
  owner: "lodash",
  repo: "lodash",
  full: "lodash/lodash",
};

describe("buildIssue", () => {
  it("generates a default title", () => {
    const issue = buildIssue(patchInfo, packageInfo, repoInfo);
    expect(issue.title).toContain("lodash@4.17.21");
  });

  it("uses custom title when provided", () => {
    const issue = buildIssue(patchInfo, packageInfo, repoInfo, { title: "My Custom Title" });
    expect(issue.title).toBe("My Custom Title");
  });

  it("includes package info in body", () => {
    const issue = buildIssue(patchInfo, packageInfo, repoInfo);
    expect(issue.body).toContain("lodash@4.17.21");
    expect(issue.body).toContain("lodash/lodash");
  });

  it("includes summary when provided", () => {
    const issue = buildIssue(patchInfo, packageInfo, repoInfo, { summary: "My summary" });
    expect(issue.body).toContain("My summary");
  });

  it("includes changed files", () => {
    const issue = buildIssue(patchInfo, packageInfo, repoInfo);
    expect(issue.body).toContain("src/index.js");
  });
});
