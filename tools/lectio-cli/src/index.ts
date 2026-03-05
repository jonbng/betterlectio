#!/usr/bin/env node
import { Command } from "commander";

import { authCommand } from "./commands/auth.js";
import { fetchCommand } from "./commands/fetch.js";
import { postCommand } from "./commands/post.js";
import { aspCommand } from "./commands/asp.js";
import { keepaliveCommand } from "./commands/keepalive.js";
import { schoolsCommand } from "./commands/schools.js";
import { configCommand } from "./commands/config.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("lectio")
  .description("CLI tool for authenticated Lectio API access")
  .version("1.0.0");

// Add commands
program.addCommand(authCommand);
program.addCommand(fetchCommand);
program.addCommand(postCommand);
program.addCommand(aspCommand);
program.addCommand(keepaliveCommand);
program.addCommand(schoolsCommand);
program.addCommand(configCommand);
program.addCommand(statusCommand);

// Default action - show help
program.action(() => {
  program.outputHelp();
});

// Parse arguments
program.parseAsync(process.argv).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
