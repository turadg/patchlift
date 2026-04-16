# Releasing patchlift

## Release checklist

1. **Start from a clean `main`.** No staged or unstaged changes, up to date with origin.

   ```sh
   git switch main && git pull && git status
   ```

2. **Bump the version.** `pnpm version` updates `package.json`, creates a commit, and tags it as `vX.Y.Z`.

   ```sh
   pnpm version patch    # or: minor | major | <explicit-version>
   ```

3. **Publish.** The `prepublishOnly` hook runs `lint`, `test`, and `build` before the tarball is created, so this step will abort if anything is broken.

   ```sh
   pnpm publish
   ```

   pnpm refuses to publish if the working tree is dirty or you aren't on the branch configured as publish-branch (defaults to `main`/`master`). Pass `--no-git-checks` only if you know why you need to.

4. **Push the tag and commit.**

   ```sh
   git push --follow-tags
   ```

5. **(Optional) Create a GitHub release** from the pushed tag for changelog visibility:
   ```sh
   gh release create v$(node -p "require('./package.json').version") --generate-notes
   ```

## What gets published

The tarball includes only the paths listed in `files` in `package.json` (currently `dist/`), plus the always-included `package.json`, `README.md`, and `LICENSE`. Source and tests are never shipped. Verify with:

```sh
pnpm pack --dry-run
```

## How the build is wired

- `pnpm run build` → `vp pack` (tsdown under Vite+). Bundles `src/index.ts` to `dist/index.mjs` with declarations at `dist/index.d.mts` and shebang preserved.
- `dependencies` (`commander`, `open`) are externalized, not bundled — they resolve at the consumer's install time.
- `bin.patchlift` points at `dist/index.mjs`, so `npx patchlift` works immediately after install.

## Troubleshooting

- **"You cannot publish over the previously published versions":** you forgot to bump. Run step 2.
- **"EPUBLISHCONFLICT" on first publish:** the name is taken. Either rename or reach out to npm support.
- **Tests fail in `prepublishOnly` but pass locally:** you probably have stale `dist/` — remove it and rerun.
