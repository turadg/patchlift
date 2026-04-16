import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface RepoInfo {
  owner: string;
  repo: string;
  full: string; // "owner/repo"
}

function normalizeRepoUrl(url: string): string {
  return url
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

function extractGitHubRepo(url: string): RepoInfo | null {
  const normalized = normalizeRepoUrl(url);
  const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    full: `${match[1]}/${match[2]}`,
  };
}

async function readPackageJson(dir: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(join(dir, "package.json"), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function resolveRepo(
  packageName: string,
  cwd: string = process.cwd(),
): Promise<RepoInfo> {
  // 1. Try local installed package metadata
  const localPkgDir = join(cwd, "node_modules", packageName);
  const localPkg = await readPackageJson(localPkgDir);

  if (localPkg) {
    const repoUrl =
      typeof localPkg.repository === "string"
        ? localPkg.repository
        : (localPkg.repository as { url?: string } | undefined)?.url;

    if (repoUrl) {
      const repoInfo = extractGitHubRepo(repoUrl);
      if (repoInfo) return repoInfo;
    }

    if (typeof localPkg.homepage === "string") {
      const repoInfo = extractGitHubRepo(localPkg.homepage);
      if (repoInfo) return repoInfo;
    }
  }

  // 2. Try npm registry metadata
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      const repoUrl =
        typeof data.repository === "string"
          ? data.repository
          : (data.repository as { url?: string } | undefined)?.url;

      if (repoUrl) {
        const repoInfo = extractGitHubRepo(repoUrl);
        if (repoInfo) return repoInfo;
      }
    }
  } catch {
    // Network error; fall through
  }

  throw new Error(
    `Cannot resolve GitHub repository for package "${packageName}". ` +
      `Ensure the package is installed or the npm registry is accessible, ` +
      `and that the repository is hosted on GitHub.`,
  );
}
