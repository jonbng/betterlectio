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
import { createSpinner, success } from "../ui/spinner.js";
import { extractASPData, buildPostBody } from "../lib/aspnet.js";

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
  .option(
    "--asp-target <target>",
    "Auto-extract ASP.NET fields: GET the page first, extract __VIEWSTATE etc., " +
      "set __EVENTTARGET to this value, merge with --form fields, and POST back. " +
      "This is the standard ASP.NET WebForms postback pattern."
  )
  .option(
    "--asp-argument <arg>",
    "__EVENTARGUMENT value (used with --asp-target)",
    ""
  )
  .option("-o, --output <file>", "Save output to file instead of stdout")
  .option("-s, --school <id>", "Override school ID")
  .option("--json", "Output as JSON with headers and metadata")
  .option("--no-follow", "Don't follow redirects")
  .action(async (path, options) => {
    const {
      data,
      dataFile,
      form,
      contentType,
      aspTarget,
      aspArgument,
      output,
      school,
      json,
      follow,
    } = options;

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

      let body: string | undefined;

      if (aspTarget) {
        // ASP.NET postback mode: GET page first, extract state, build body
        const getSpinner = json
          ? null
          : createSpinner(`GET ${path} (extracting ASP.NET state)...`);
        getSpinner?.start();

        const getResult = await fetchLectio(path, { schoolId });

        if (getSpinner) {
          success(getSpinner, `Extracted ASP.NET state from ${getResult.url}`);
        }

        const aspData = extractASPData(getResult.body, aspTarget);
        if (aspArgument) {
          aspData.__EVENTARGUMENT = aspArgument;
        }

        // Parse extra form fields
        const extraFields: Record<string, string> = {};
        if (form && form.length > 0) {
          for (const pair of form as string[]) {
            const eqIndex = pair.indexOf("=");
            if (eqIndex === -1) {
              throw new Error(
                `Invalid form field "${pair}". Use key=value format.`
              );
            }
            extraFields[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
          }
        }

        body = buildPostBody(aspData, extraFields);
      } else {
        // Manual body mode (original behavior)
        if (data) {
          body = data;
        } else if (dataFile) {
          body = readFileSync(dataFile, "utf-8");
        } else if (form && form.length > 0) {
          const params = new URLSearchParams();
          for (const pair of form as string[]) {
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
      }

      if (!body) {
        const message =
          "No request body provided. Use --data, --data-file, --form, or --asp-target.";
        if (json) {
          console.log(JSON.stringify({ success: false, error: message }));
        } else {
          console.error(chalk.red("Error:"), message);
        }
        process.exit(1);
      }

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
        console.log(chalk.green("\u2713") + ` Saved to ${chalk.bold(output)}`);
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
