import { Command } from "commander";
import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import {
  fetchLectio,
  getCurrentSchoolId,
  getCurrentSchoolName,
} from "../lib/http.js";
import { isSessionValid } from "../lib/cookies.js";
import { createSpinner, success, fail } from "../ui/spinner.js";

export const postCommand = new Command("post")
  .description("Send a POST request to a Lectio page")
  .argument("<path>", "Page path (e.g., ElevAflevering.aspx) or full URL")
  .option("-d, --data <body>", "Request body (URL-encoded string)")
  .option(
    "-f, --data-file <file>",
    "Read request body from file"
  )
  .option(
    "--form <pairs...>",
    "Form fields as key=value pairs (e.g., --form name=Jon class=3a)"
  )
  .option(
    "-t, --content-type <type>",
    "Content-Type header (default: application/x-www-form-urlencoded)"
  )
  .option("-o, --output <file>", "Save output to file instead of stdout")
  .option("-s, --school <id>", "Override school ID")
  .option("--json", "Output as JSON with headers and metadata")
  .option("--no-follow", "Don't follow redirects")
  .action(async (path, options) => {
    const { data, dataFile, form, contentType, output, school, json, follow } =
      options;

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

      // Resolve request body from the various input options
      let body: string | undefined;

      if (data) {
        body = data;
      } else if (dataFile) {
        body = readFileSync(dataFile, "utf-8");
      } else if (form && form.length > 0) {
        const params = new URLSearchParams();
        for (const pair of form) {
          const eqIndex = pair.indexOf("=");
          if (eqIndex === -1) {
            throw new Error(
              `Invalid form field "${pair}". Use key=value format.`
            );
          }
          params.append(pair.slice(0, eqIndex), pair.slice(eqIndex + 1));
        }
        body = params.toString();
      }

      if (!body) {
        const message =
          "No request body provided. Use --data, --data-file, or --form.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: message }));
        } else {
          console.error(chalk.red("Error:"), message);
        }
        process.exit(1);
      }

      const schoolId = school ?? getCurrentSchoolId();
      const schoolName = getCurrentSchoolName();

      const spinner = json ? null : createSpinner(`POST ${path}...`);
      spinner?.start();

      const result = await fetchLectio(path, {
        schoolId,
        followRedirects: follow,
        method: "POST",
        body,
        contentType,
      });

      if (spinner) {
        success(spinner, `POST ${result.url} (${result.status})`);
      }

      if (json) {
        console.log(
          JSON.stringify({
            success: true,
            status: result.status,
            url: result.url,
            redirected: result.redirected,
            headers: result.headers,
            body: result.body,
            school: schoolId
              ? { id: schoolId, name: schoolName }
              : undefined,
          })
        );
      } else if (output) {
        writeFileSync(output, result.body, "utf-8");
        console.log(chalk.green("✓") + ` Saved to ${chalk.bold(output)}`);
        console.log(chalk.gray(`  ${result.body.length} bytes`));
      } else {
        console.log(result.body);
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
