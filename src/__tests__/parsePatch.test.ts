import { describe, it, expect } from "vite-plus/test";
import { parsePatch } from "../core/parsePatch.js";

const SAMPLE_PATCH = `diff --git a/src/index.js b/src/index.js
index abc123..def456 100644
--- a/src/index.js
+++ b/src/index.js
@@ -1,5 +1,6 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
`;

describe("parsePatch", () => {
  it("parses changed files", () => {
    const result = parsePatch(SAMPLE_PATCH);
    expect(result.files).toEqual(["src/index.js"]);
  });

  it("counts additions and deletions", () => {
    const result = parsePatch(SAMPLE_PATCH);
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
  });

  it("preserves raw content", () => {
    const result = parsePatch(SAMPLE_PATCH);
    expect(result.rawContent).toBe(SAMPLE_PATCH);
  });
});
