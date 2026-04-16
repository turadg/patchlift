#!/usr/bin/env node
import { Command, Option } from "commander";
import { forwardCommand } from "./commands/forward.js";
import { issueCommand } from "./commands/issue.js";
import { inspectCommand } from "./commands/inspect.js";
import { triageCommand } from "./commands/triage.js";
import { updateCommand } from "./commands/update.js";
import { STATUSES } from "./core/sidecar.js";

const program = new Command();

program.name("patchlift").description("Lift your local Yarn patches upstream").version("0.1.0");

program
  .command("issue <patchFile>")
  .description("Generate a GitHub issue and update sidecar")
  .option("--title <string>", "Issue title")
  .option("--summary <string>", "Issue summary")
  .option("--no-web", "Do not open browser")
  .option("--print", "Print issue to stdout")
  .option("--issue <url>", "Manual issue URL override")
  .option("--dry-run", "Do not write sidecar")
  .action(
    async (
      patchFile: string,
      options: {
        title?: string;
        summary?: string;
        web: boolean;
        print: boolean;
        issue?: string;
        dryRun: boolean;
      },
    ) => {
      try {
        await issueCommand(patchFile, options);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    },
  );

program
  .command("forward <oldPatch> <newPatch>")
  .description("Carry sidecar metadata from one patch to another (e.g. after a version bump)")
  .action(async (oldPatch: string, newPatch: string) => {
    try {
      await forwardCommand(oldPatch, newPatch);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("inspect [patchFile]")
  .description("Inspect patches and their upstream state")
  .option("--json", "Output as JSON")
  .option("--verbose", "Verbose output")
  .action(async (patchFile: string | undefined, options: { json: boolean; verbose: boolean }) => {
    try {
      await inspectCommand(patchFile, options);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("triage")
  .description("Interactively classify untracked patches")
  .action(async () => {
    try {
      await triageCommand();
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("update <patchFile>")
  .description("Update sidecar metadata")
  .option("--issue <url>", "Issue URL")
  .option("--pr <url>", "PR URL")
  .addOption(new Option("--status <status>", "Patch status").choices([...STATUSES]))
  .option("--notes <string>", "Notes")
  .option("--clear", "Clear all metadata")
  .action(async (patchFile: string, options) => {
    try {
      await updateCommand(patchFile, options);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
