export interface PatchInfo {
  files: string[];
  additions: number;
  deletions: number;
  rawContent: string;
}

export function parsePatch(content: string): PatchInfo {
  const lines = content.split("\n");
  const files: string[] = [];
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      // e.g. "diff --git a/path/to/file b/path/to/file"
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (match) {
        files.push(match[2]);
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { files, additions, deletions, rawContent: content };
}
