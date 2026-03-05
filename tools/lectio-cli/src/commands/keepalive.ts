import { Command } from "commander";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { isSessionValid, getSessionStatus } from "../lib/cookies.js";
import {
  getKeepaliveStatus,
  stopKeepalive,
  runKeepaliveLoop,
  ping,
  readLog,
} from "../lib/keepalive.js";

const DEFAULT_INTERVAL_SEC = 10 * 60; // 10 minutes

export const keepaliveCommand = new Command("keepalive")
  .description("Keep your Lectio session alive with periodic pings")
  .addCommand(startCommand())
  .addCommand(stopCommand())
  .addCommand(statusCommand())
  .addCommand(pingCommand())
  .addCommand(logCommand())
  .addCommand(runCommand());

function startCommand(): Command {
  return new Command("start")
    .description(
      "Start a background daemon that pings Lectio periodically"
    )
    .option(
      "-i, --interval <seconds>",
      "Ping interval in seconds (default: 600 = 10min)",
      String(DEFAULT_INTERVAL_SEC)
    )
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { interval: intervalStr, json } = options;
      const intervalSec = parseInt(intervalStr, 10);

      if (isNaN(intervalSec) || intervalSec < 30) {
        const msg = "Interval must be at least 30 seconds.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(chalk.red("Error:"), msg);
        }
        process.exit(1);
      }

      // Check session
      if (!isSessionValid()) {
        const msg =
          "Not authenticated or session expired. Run 'lectio auth' first.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(chalk.red("Error:"), msg);
        }
        process.exit(1);
      }

      // Check if already running
      const status = getKeepaliveStatus();
      if (status.running) {
        const msg = `Keepalive is already running (PID ${status.pid}).`;
        if (json) {
          console.log(
            JSON.stringify({ success: false, error: msg, pid: status.pid })
          );
        } else {
          console.error(chalk.yellow("Warning:"), msg);
          console.log(chalk.gray("  Use 'lectio keepalive stop' first."));
        }
        process.exit(1);
      }

      // Spawn a detached child process that runs `lectio keepalive run`
      // This is the actual daemon — it detaches from the terminal.
      const child = spawn(
        process.argv[0], // bun or node
        [
          ...process.argv.slice(1, -1).filter((a) => a !== "start"), // strip "start"
          "keepalive",
          "run",
          "--interval",
          String(intervalSec),
        ],
        {
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        }
      );

      child.unref();

      // Give it a moment to start and write its PID file
      await new Promise((r) => setTimeout(r, 500));

      const newStatus = getKeepaliveStatus();
      if (newStatus.running) {
        if (json) {
          console.log(
            JSON.stringify({
              success: true,
              pid: newStatus.pid,
              interval: intervalSec,
            })
          );
        } else {
          const session = getSessionStatus();
          console.log(
            chalk.green("\u2713") +
              ` Keepalive started (PID ${newStatus.pid})`
          );
          console.log(
            chalk.gray(
              `  Pinging every ${intervalSec}s for ${chalk.bold(session.school?.name ?? "unknown")}`
            )
          );
          console.log(
            chalk.gray("  Log: ~/.lectio-cli/keepalive.log")
          );
          console.log(
            chalk.gray("  Stop with: lectio keepalive stop")
          );
        }
      } else {
        const msg = "Failed to start keepalive daemon.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(chalk.red("Error:"), msg);
          console.log(
            chalk.gray("  Check ~/.lectio-cli/keepalive.log for details.")
          );
        }
        process.exit(1);
      }
    });
}

function stopCommand(): Command {
  return new Command("stop")
    .description("Stop the keepalive daemon")
    .option("--json", "Output as JSON")
    .action((_options) => {
      const { json } = _options;
      const stopped = stopKeepalive();

      if (json) {
        console.log(JSON.stringify({ success: true, stopped }));
      } else if (stopped) {
        console.log(chalk.green("\u2713") + " Keepalive stopped.");
      } else {
        console.log(chalk.gray("No keepalive daemon was running."));
      }
    });
}

function statusCommand(): Command {
  return new Command("status")
    .description("Check keepalive daemon status")
    .option("--json", "Output as JSON")
    .action((_options) => {
      const { json } = _options;
      const status = getKeepaliveStatus();
      const session = getSessionStatus();

      if (json) {
        console.log(JSON.stringify({ ...status, session }));
      } else if (status.running) {
        console.log(
          chalk.green("\u2713") +
            ` Keepalive running (PID ${status.pid})`
        );
        console.log(
          chalk.gray(`  Interval: ${status.interval}s`)
        );
        if (session.school) {
          console.log(
            chalk.gray(`  School: ${session.school.name}`)
          );
        }
        if (session.session) {
          const mins = Math.floor(session.session.expiresIn / 60);
          console.log(
            chalk.gray(`  Session expires in: ${mins} min`)
          );
        }
        console.log(chalk.gray(`  Log: ${status.logFile}`));
      } else {
        console.log(chalk.gray("Keepalive is not running."));
      }
    });
}

function pingCommand(): Command {
  return new Command("ping")
    .description("Send a single keepalive ping (foreground)")
    .option("--json", "Output as JSON")
    .action(async (_options) => {
      const { json } = _options;

      if (!isSessionValid()) {
        const msg =
          "Not authenticated or session expired. Run 'lectio auth' first.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          console.error(chalk.red("Error:"), msg);
        }
        process.exit(1);
      }

      const result = await ping();

      if (json) {
        console.log(JSON.stringify(result));
      } else if (result.success) {
        console.log(
          chalk.green("\u2713") +
            ` Ping OK (status ${result.status})`
        );
      } else {
        console.error(
          chalk.red("Ping failed:"),
          result.error
        );
        process.exit(1);
      }
    });
}

function logCommand(): Command {
  return new Command("log")
    .description("Show recent keepalive log entries")
    .option(
      "-n, --lines <count>",
      "Number of lines to show",
      "20"
    )
    .option("--json", "Output as JSON")
    .action((_options) => {
      const { lines: linesStr, json } = _options;
      const count = parseInt(linesStr, 10) || 20;
      const lines = readLog(count);

      if (json) {
        console.log(JSON.stringify({ lines }));
      } else if (lines.length === 0) {
        console.log(chalk.gray("No keepalive log entries."));
      } else {
        for (const line of lines) {
          // Colorize based on content
          if (line.includes("FAILED")) {
            console.log(chalk.red(line));
          } else if (line.includes("stopping") || line.includes("expired")) {
            console.log(chalk.yellow(line));
          } else {
            console.log(chalk.gray(line));
          }
        }
      }
    });
}

/**
 * Hidden `run` subcommand — executed by the detached child process.
 * This is the actual long-running keepalive loop. Not intended for
 * direct user invocation (but works fine if you want foreground mode).
 */
function runCommand(): Command {
  return new Command("run")
    .description("Run keepalive loop in foreground (used internally by start)")
    .option(
      "-i, --interval <seconds>",
      "Ping interval in seconds",
      String(DEFAULT_INTERVAL_SEC)
    )
    .action(async (options) => {
      const intervalSec = parseInt(options.interval, 10);
      const intervalMs = intervalSec * 1000;
      await runKeepaliveLoop(intervalMs);
    });
}
