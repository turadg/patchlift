# patchlift

Track and upstream your local Yarn patches.

Monorepos accumulate `yarn patch` overrides, each one a diff a maintainer probably wants to see. patchlift keeps a sidecar JSON next to every patch in `.yarn/patches/` recording its upstream state (filed? merged? rejected? never going upstream?), and gives you the commands to act on them.

## Install

```sh
pnpm add -D patchlift
# or one-shot:
pnpm dlx patchlift inspect
```

## Quickstart

```sh
# See all patches in the current project with their upstream status
patchlift inspect

# Inspect one patch — path or bare filename both work
patchlift inspect lodash-npm-4.17.21-abc123.patch

# File a GitHub issue: opens a pre-filled draft in your browser
patchlift issue lodash-npm-4.17.21-abc123.patch

# After you submit, record the URL (promotes the status to "proposed")
patchlift update lodash-npm-4.17.21-abc123.patch \
  --issue https://github.com/lodash/lodash/issues/1234

# Mark a patch you've decided not to upstream
patchlift update my-hack.patch --status localonly --notes "project-specific tweak"
```

Bare filenames (without `.yarn/patches/` prefix) resolve automatically, so you rarely need full paths.

## Commands

### `patchlift inspect [patchFile]`

Tabular view of all patches in `.yarn/patches/`, or just the one you named. Shows package, version, status, and linked issue.

Handles **patch chains** (when `yarn patch` is applied on top of an existing patch) by resolving the true package name via the root `package.json`'s `resolutions`, and renders the layers as an indented tree:

```
@endo-pass-style-npm-1.6.3-139d4e4c47.patch        @endo/pass-style  1.6.3  untracked  -
  ↳ @endo-pass-style-patch-fd208907c7.patch        @endo/pass-style  1.6.3  untracked  -
    ↳ @endo-pass-style-patch-613c0f4a7a.patch      @endo/pass-style  1.6.3  untracked  -
```

Also flags **drift**: when a patch file changes after its sidecar was written, the recorded hash no longer matches and a warning is printed beneath the row.

Options: `--json` (machine-readable), `--verbose` (dump each sidecar).

### `patchlift issue <patchFile>`

Generates a GitHub issue draft modeled after [patch-package's](https://github.com/ds300/patch-package) upstream template — a friendly greeting, the diff, and a fill-in-the-blank block for the reporter's context. Opens the GitHub issue form in your browser by default.

Options: `--title <s>`, `--summary <s>`, `--print` (stdout), `--no-web` (skip browser), `--issue <url>` (record a manually-filed URL, usually with `--no-web`), `--dry-run` (don't write the sidecar).

### `patchlift update <patchFile>`

Mutates the sidecar directly.

| Flag               | Effect                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `--issue <url>`    | Record the issue URL. Implicitly promotes `untracked` → `proposed`. |
| `--pr <url>`       | Record the PR URL.                                                  |
| `--status <value>` | Set status (validated against the list below).                      |
| `--notes <string>` | Freeform note.                                                      |
| `--clear`          | Reset the sidecar to the initial `untracked` state.                 |

## Status lifecycle

```
                 untracked          ← default; no upstream action taken
                     │
                     │ file an issue
                     ▼
                  proposed          ← issue URL recorded
                     │
           ┌─────────┴─────────┐
           ▼                   ▼
         merged             rejected
```

Two terminal statuses sit outside the upstream flow:

- **`localonly`** — you've deliberately decided not to file upstream (project-specific hack, internal fork of your own dep, etc.). Distinct from `rejected`, which implies "we tried, they declined."
- **`obsolete`** — the patch is no longer needed locally (upstream shipped a fix, you dropped the dependency, etc.).

## Sidecar format

Each patch `foo.patch` gets a companion file `foo.patchlift.yml`:

```yaml
schemaVersion: 1
patchHash: "sha256:…"
package:
  name: lodash
  version: "4.17.21"
upstream:
  repo: lodash/lodash
  issue: https://github.com/lodash/lodash/issues/1234
  pr: null
status: proposed
notes: null
createdAt: 2026-04-15T16:00:00.000Z
updatedAt: 2026-04-15T16:30:00.000Z
```

Commit these alongside the patch files — they're project state, not local scratch.

## License

MIT — see [LICENSE](./LICENSE).
