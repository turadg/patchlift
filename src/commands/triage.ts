import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve as resolvePath } from "node:path";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { detectPatchLayout } from "../core/patchLayout.js";
import { readSidecar, resolveSidecarStatus } from "../core/sidecar.js";
import type { Status } from "../core/sidecar.js";
import { inferPackage } from "../core/inferPackage.js";
import { loadResolutions, buildChainMap } from "../core/resolutions.js";
import type { ChainEntry } from "../core/resolutions.js";
import { resolveRepo } from "../core/resolveRepo.js";
import { updateCommand } from "./update.js";

const STATUS_ACTIONS = ["proposed", "localonly", "obsolete", "rejected", "merged"] as const;
type StatusAction = (typeof STATUS_ACTIONS)[number];
type Action = StatusAction | "skip" | "view" | "quit";

const CANCEL = Symbol("cancel");

interface HotkeyOption {
  key: string;
  value: Action;
  label: string;
}

const ACTIONS: HotkeyOption[] = [
  { key: "v", value: "view", label: "view full patch (opens $PAGER)" },
  { key: "s", value: "skip", label: "skip — leave untracked" },
  { key: "p", value: "proposed", label: "proposed — I have filed an issue" },
  { key: "l", value: "localonly", label: "localonly — will not upstream" },
  { key: "o", value: "obsolete", label: "obsolete — no longer needed" },
  { key: "r", value: "rejected", label: "rejected — upstream declined" },
  { key: "m", value: "merged", label: "merged — upstream fix shipped" },
  { key: "q", value: "quit", label: "quit triage" },
];

interface UpdateInput {
  issue?: string;
  pr?: string;
  status?: Status;
  notes?: string;
  clear: boolean;
}

interface PatchInfo {
  name: string | null;
  version: string | null;
  repo: string | null;
}

const ALT_ON = "\x1b[?1049h";
const ALT_OFF = "\x1b[?1049l";
const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function resolvePatchInfo(
  patchFile: string,
  chainMap: Map<string, ChainEntry>,
): Promise<PatchInfo> {
  const sidecar = await readSidecar(patchFile);
  if (sidecar) {
    return {
      name: sidecar.package.name,
      version: sidecar.package.version,
      repo: sidecar.upstream.repo ?? null,
    };
  }

  let name: string | null = null;
  let version: string | null = null;
  const entry = chainMap.get(basename(patchFile));
  if (entry) {
    name = entry.name;
    version = entry.version;
  } else {
    try {
      const pkg = inferPackage(patchFile);
      name = pkg.name;
      version = pkg.version;
    } catch {
      // leave null
    }
  }

  let repo: string | null = null;
  if (name) {
    try {
      repo = (await resolveRepo(name)).full;
    } catch {
      // best-effort; leave null
    }
  }

  return { name, version, repo };
}

function printHeader(info: PatchInfo, patchFile: string, idx: number, total: number): void {
  const cols = Math.min(process.stdout.columns ?? 72, 100);
  const bar = "━".repeat(cols);
  const name = info.name ?? "(unknown)";
  const version = info.version ?? "?";
  const repo = info.repo ?? DIM + "(repo not resolved)" + RESET;

  console.log();
  console.log(DIM + bar + RESET);
  console.log();
  console.log(`  ${BOLD}${name}${RESET}  ${version}`);
  console.log(`  ${repo.startsWith("\x1b") ? repo : `github.com/${repo}`}`);
  console.log();
  console.log(`  ${DIM}${resolvePath(patchFile)}${RESET}`);
  console.log(`  ${DIM}${idx} / ${total}${RESET}`);
  console.log();
  console.log(DIM + bar + RESET);
  console.log();
}

const HEADER_LINES = 10;
const PROMPT_RESERVE = 14; // hotkey menu: title + 8 rows + prompt line + padding
const TRUNC_RESERVE = 2;
const MIN_PATCH_LINES = 8;

function truncatePatch(content: string): { body: string; truncated: number } {
  const lines = content.split("\n");
  const rows = process.stdout.rows;
  if (!rows) return { body: content, truncated: 0 };
  const maxLines = Math.max(MIN_PATCH_LINES, rows - HEADER_LINES - PROMPT_RESERVE - TRUNC_RESERVE);
  if (lines.length <= maxLines) return { body: content, truncated: 0 };
  return {
    body: lines.slice(0, maxLines).join("\n"),
    truncated: lines.length - maxLines,
  };
}

function renderOption(opt: HotkeyOption): string {
  const first = opt.label.charAt(0).toUpperCase();
  const rest = opt.label.slice(1);
  return `${BOLD}${first}${RESET}${rest}`;
}

async function promptHotkey(options: HotkeyOption[]): Promise<Action | typeof CANCEL> {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("triage requires an interactive terminal");

  console.log();
  for (const opt of options) {
    console.log(`  ${renderOption(opt)}`);
  }
  console.log();
  process.stdout.write(`  ${DIM}press a key (Esc to cancel) ›${RESET} `);

  return new Promise((resolvePromise) => {
    const prevRaw = stdin.isRaw ?? false;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(prevRaw);
      stdin.pause();
    };

    const onData = (buf: string): void => {
      if (buf === "\u0003" || buf === "\u001b") {
        cleanup();
        process.stdout.write("\n");
        resolvePromise(CANCEL);
        return;
      }
      if (buf.length !== 1) return; // swallow escape sequences (arrows, etc.)
      const ch = buf.toLowerCase();
      const match = options.find((o) => o.key === ch);
      if (!match) return;
      cleanup();
      process.stdout.write(`${renderOption(match)}\n`);
      resolvePromise(match.value);
    };
    stdin.on("data", onData);
  });
}

async function viewInPager(content: string): Promise<void> {
  const pager = process.env.PAGER?.trim() || "less";
  const [cmd, ...preArgs] = pager.split(/\s+/);
  const args = cmd === "less" && preArgs.length === 0 ? ["-R"] : preArgs;
  await new Promise<void>((resolvePromise) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
    proc.on("error", () => resolvePromise());
    proc.on("close", () => resolvePromise());
    proc.stdin.write(content);
    proc.stdin.end();
  });
}

function enterAltScreen(): () => void {
  process.stdout.write(ALT_ON);
  let exited = false;
  const exit = (): void => {
    if (exited) return;
    exited = true;
    process.stdout.write(ALT_OFF);
  };
  const onSignal = (): void => {
    exit();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    exit();
  };
}

export async function triageCommand(): Promise<void> {
  const layout = detectPatchLayout();
  if (!layout || !existsSync(layout.patchDir)) {
    console.log("No supported patch directory found.");
    return;
  }

  const files = await readdir(layout.patchDir);
  const patchFiles = files
    .filter((f) => f.endsWith(".patch"))
    .map((f) => join(layout.patchDir, f))
    .sort();

  const untracked: string[] = [];
  for (const file of patchFiles) {
    const sidecar = await readSidecar(file);
    if (resolveSidecarStatus(sidecar) === "untracked") {
      untracked.push(file);
    }
  }

  if (untracked.length === 0) {
    console.log("Nothing to triage — all patches have a status.");
    return;
  }

  const resolutions = await loadResolutions(process.cwd());
  const chainMap = buildChainMap(resolutions);

  const noun = untracked.length === 1 ? "patch" : "patches";
  p.intro(`patchlift triage — ${untracked.length} untracked ${noun}`);

  const useAltScreen = process.stdout.isTTY;
  const restore = useAltScreen ? enterAltScreen() : () => {};

  let updated = 0;
  let skipped = 0;
  let cancelled = false;

  try {
    outer: for (let i = 0; i < untracked.length; i++) {
      const patchFile = untracked[i];

      if (useAltScreen) process.stdout.write(CLEAR);

      const info = await resolvePatchInfo(patchFile, chainMap);
      printHeader(info, patchFile, i + 1, untracked.length);

      const content = await readFile(patchFile, "utf-8");
      const { body, truncated } = truncatePatch(content);
      console.log(body);
      if (truncated > 0) {
        console.log();
        console.log(
          `  ${DIM}… ${truncated} more line${truncated === 1 ? "" : "s"} — press V to view, or ⌘-click the path above${RESET}`,
        );
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const selected = await promptHotkey(ACTIONS);

        if (selected === CANCEL || selected === "quit") {
          cancelled = true;
          break outer;
        }
        if (selected === "view") {
          await viewInPager(content);
          if (useAltScreen) {
            process.stdout.write(CLEAR);
            printHeader(info, patchFile, i + 1, untracked.length);
            console.log(body);
            if (truncated > 0) {
              console.log();
              console.log(
                `  ${DIM}… ${truncated} more line${truncated === 1 ? "" : "s"} — press V to view, or ⌘-click the path above${RESET}`,
              );
            }
          }
          continue;
        }
        if (selected === "skip") {
          skipped++;
          continue outer;
        }

        const updateOpts: UpdateInput = { clear: false, status: selected };

        if (selected === "proposed" || selected === "rejected") {
          const url = await p.text({
            message: "Issue URL",
            validate: (v) => (!v || v.trim().length === 0 ? "Required" : undefined),
          });
          if (p.isCancel(url)) continue; // back to menu
          updateOpts.issue = url;
        } else if (selected === "merged") {
          const url = await p.text({
            message: "PR URL",
            validate: (v) => (!v || v.trim().length === 0 ? "Required" : undefined),
          });
          if (p.isCancel(url)) continue; // back to menu
          updateOpts.pr = url;
        }

        const notes = await p.text({
          message: "Notes (optional — Enter to skip)",
          placeholder: "",
          defaultValue: "",
        });
        // Enter (empty) and Esc both mean "no notes" — proceed to write either way.
        if (!p.isCancel(notes) && notes.trim().length > 0) {
          updateOpts.notes = notes;
        }

        try {
          await updateCommand(patchFile, updateOpts);
          updated++;
        } catch (err) {
          p.log.error(`Failed to update ${basename(patchFile)}: ${(err as Error).message}`);
        }
        break; // advance to next patch
      }
    }
  } finally {
    restore();
  }

  const remaining = untracked.length - updated - skipped;
  const summary = `Updated ${updated}, skipped ${skipped}${remaining > 0 ? `, ${remaining} untouched` : ""}.`;
  if (cancelled) {
    p.cancel(`Triage stopped. ${summary}`);
  } else {
    p.outro(`Triage complete. ${summary}`);
  }
}
