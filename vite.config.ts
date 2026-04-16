import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: { trailingComma: "all" },
  lint: { options: { typeAware: true, typeCheck: true } },
});
