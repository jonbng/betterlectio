import { Command } from "commander";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import {
  fetchLectio,
  getCurrentSchoolId,
  getCurrentSchoolName,
} from "../lib/http.js";
import { isSessionValid } from "../lib/cookies.js";
import { createSpinner, success } from "../ui/spinner.js";
import { extractForm, extractPostbackTargets } from "../lib/aspnet.js";

export const fetchCommand = new Command("fetch")
  .description("Fetch a page from Lectio")
  .argument("<path>", "Page path (e.g., skemany.aspx) or full URL")
  .option("-o, --output <file>", "Save output to file instead of stdout")
  .option("-s, --school <id>", "Override school ID")
  .option("--json", "Output as JSON with headers and metadata")
  .option("--no-follow", "Don't follow redirects")
  .option(
    "--asp",
    "Also extract and display ASP.NET form fields and postback targets"
  )
  .action(async (path, options) => {
    const { output, school, json, follow, asp } = options;

    try {
      // Check if authenticated
      if (!isSessionValid()) {
        const message =
          "Not authenticated or session expired. Run 'lectio auth' first.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: message }));
        } else {
          console.error(chalk.red("Error:"), message);
        }
        process.exit(1);
      }

      const schoolId = school ?? getCurrentSchoolId();
      const schoolName = getCurrentSchoolName();

      const spinner = json ? null : createSpinner(`Fetching ${path}...`);
      spinner?.start();

      const result = await fetchLectio(path, {
        schoolId,
        followRedirects: follow,
      });

      if (spinner) {
        success(spinner, `Fetched ${result.url} (${result.status})`);
      }

      if (json) {
        const jsonOutput: Record<string, unknown> = {
          success: true,
          status: result.status,
          url: result.url,
          redirected: result.redirected,
          headers: result.headers,
          body: result.body,
          school: schoolId ? { id: schoolId, name: schoolName } : undefined,
        };

        if (asp) {
          const form = extractForm(result.body);
          const postbackTargets = extractPostbackTargets(result.body);
          jsonOutput.aspnet = {
            aspFields: form.aspFields,
            formFields: form.formFields,
            formAction: form.formAction,
            postbackTargets,
          };
        }

        console.log(JSON.stringify(jsonOutput));
      } else if (output) {
        writeFileSync(output, result.body, "utf-8");
        console.log(chalk.green("\u2713") + ` Saved to ${chalk.bold(output)}`);
        console.log(chalk.gray(`  ${result.body.length} bytes`));

        if (asp) {
          printAspSummary(result.body);
        }
      } else {
        if (asp) {
          // When --asp is used without --output, show ASP info instead of raw HTML
          printAspSummary(result.body);
        } else {
          // Output to stdout
          console.log(result.body);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      if (json) {
        console.log(JSON.stringify({ success: false, error: message }));
      } else {
        console.error(chalk.red("Error:"), message);
      }
      process.exit(1);
    }
  });

function printAspSummary(html: string): void {
  const form = extractForm(html);
  const postbackTargets = extractPostbackTargets(html);

  console.log();

  if (form.formAction) {
    console.log(chalk.gray("Form action:"), chalk.cyan(form.formAction));
    console.log();
  }

  console.log(chalk.bold.underline("ASP.NET Hidden Fields"));
  const aspEntries = Object.entries(form.aspFields);
  for (const [key, value] of aspEntries) {
    const display =
      value.length > 80
        ? value.slice(0, 77) + "..."
        : value || chalk.gray("(empty)");
    console.log(`  ${chalk.yellow(key.padEnd(24))} ${display}`);
  }
  console.log();

  if (form.formFields.length > 0) {
    console.log(chalk.bold.underline("Form Fields"));
    for (const f of form.formFields) {
      const typeTag = chalk.gray(`[${f.type}]`);
      const value =
        f.value.length > 60
          ? f.value.slice(0, 57) + "..."
          : f.value || chalk.gray("(empty)");
      console.log(`  ${typeTag} ${chalk.cyan(f.name.padEnd(50))} ${value}`);
    }
    console.log();
  }

  if (postbackTargets.length > 0) {
    console.log(chalk.bold.underline("Postback Targets"));
    for (const t of postbackTargets) {
      const label = t.context ? chalk.gray(` (${t.context})`) : "";
      const arg = t.argument
        ? chalk.gray(` arg=${chalk.white(t.argument)}`)
        : "";
      console.log(`  ${chalk.green(t.target)}${arg}${label}`);
    }
    console.log();
  }

  console.log(
    chalk.gray(
      `${aspEntries.length} ASP.NET fields, ` +
        `${form.formFields.length} form fields, ` +
        `${postbackTargets.length} postback targets`
    )
  );
}
