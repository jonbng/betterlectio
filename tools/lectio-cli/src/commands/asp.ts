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
import {
  extractASPData,
  extractForm,
  extractPostbackTargets,
  buildPostBody,
  extractFieldById,
} from "../lib/aspnet.js";

/**
 * `lectio asp` - Smart ASP.NET WebForms interaction command.
 *
 * Subcommands:
 *   inspect <path>  - GET a page and display all ASP.NET fields, form fields, and postback targets
 *   postback <path> - GET a page, extract ASP.NET state, merge your fields, and POST back (the standard WebForms pattern)
 *   field <path>    - Extract a specific field value by ID from a page
 */
export const aspCommand = new Command("asp")
  .description("ASP.NET WebForms utilities (inspect forms, trigger postbacks)")
  .addCommand(inspectCommand())
  .addCommand(postbackCommand())
  .addCommand(fieldCommand());

function inspectCommand(): Command {
  return new Command("inspect")
    .description(
      "Fetch a page and display its ASP.NET form state, fields, and postback targets"
    )
    .argument("<path>", "Page path (e.g., beskeder2.aspx) or full URL")
    .option("-s, --school <id>", "Override school ID")
    .option("--json", "Output as JSON")
    .option("--targets", "Only show postback targets (__doPostBack calls)")
    .option("--fields", "Only show form fields (non-ASP.NET)")
    .option("--asp", "Only show ASP.NET hidden fields")
    .action(async (path, options) => {
      const { school, json, targets, fields, asp } = options;
      try {
        if (!isSessionValid()) {
          printError(
            "Not authenticated or session expired. Run 'lectio auth' first.",
            json
          );
          process.exit(1);
        }

        const schoolId = school ?? getCurrentSchoolId();
        const spinner = json ? null : createSpinner(`Fetching ${path}...`);
        spinner?.start();

        const result = await fetchLectio(path, { schoolId });
        const html = result.body;

        if (spinner) {
          success(spinner, `Fetched ${result.url} (${result.status})`);
        }

        const form = extractForm(html);
        const postbackTargets = extractPostbackTargets(html);
        const showAll = !targets && !fields && !asp;

        if (json) {
          const output: Record<string, unknown> = { success: true, url: result.url };
          if (showAll || asp) output.aspFields = form.aspFields;
          if (showAll || fields) output.formFields = form.formFields;
          if (showAll || targets) output.postbackTargets = postbackTargets;
          if (form.formAction) output.formAction = form.formAction;
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Pretty-print results
        if (form.formAction) {
          console.log(
            chalk.gray("Form action:"),
            chalk.cyan(form.formAction)
          );
          console.log();
        }

        if (showAll || asp) {
          console.log(chalk.bold.underline("ASP.NET Hidden Fields"));
          const aspEntries = Object.entries(form.aspFields);
          if (aspEntries.length === 0) {
            console.log(chalk.gray("  (none found)"));
          } else {
            for (const [key, value] of aspEntries) {
              const display =
                value.length > 80
                  ? value.slice(0, 77) + "..."
                  : value || chalk.gray("(empty)");
              console.log(
                `  ${chalk.yellow(key.padEnd(24))} ${display}`
              );
            }
          }
          console.log();
        }

        if (showAll || fields) {
          console.log(chalk.bold.underline("Form Fields"));
          if (form.formFields.length === 0) {
            console.log(chalk.gray("  (none found)"));
          } else {
            for (const f of form.formFields) {
              const typeTag = chalk.gray(`[${f.type}]`);
              const value =
                f.value.length > 60
                  ? f.value.slice(0, 57) + "..."
                  : f.value || chalk.gray("(empty)");
              console.log(
                `  ${typeTag} ${chalk.cyan(f.name.padEnd(50))} ${value}`
              );
            }
          }
          console.log();
        }

        if (showAll || targets) {
          console.log(chalk.bold.underline("Postback Targets"));
          if (postbackTargets.length === 0) {
            console.log(chalk.gray("  (none found)"));
          } else {
            for (const t of postbackTargets) {
              const label = t.context
                ? chalk.gray(` (${t.context})`)
                : "";
              const arg = t.argument
                ? chalk.gray(` arg=${chalk.white(t.argument)}`)
                : "";
              console.log(
                `  ${chalk.green(t.target)}${arg}${label}`
              );
            }
          }
          console.log();
        }

        // Summary
        console.log(
          chalk.gray(
            `${Object.keys(form.aspFields).length} ASP.NET fields, ` +
              `${form.formFields.length} form fields, ` +
              `${postbackTargets.length} postback targets`
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        printError(message, json);
        process.exit(1);
      }
    });
}

function postbackCommand(): Command {
  return new Command("postback")
    .description(
      "Perform an ASP.NET postback: GET page, extract state, POST back with merged fields"
    )
    .argument("<path>", "Page path (e.g., beskeder2.aspx) or full URL")
    .requiredOption(
      "-t, --target <target>",
      "__EVENTTARGET value (the control that triggers the postback)"
    )
    .option(
      "-a, --argument <arg>",
      "__EVENTARGUMENT value",
      ""
    )
    .option(
      "--form <pairs...>",
      "Extra form fields as key=value pairs"
    )
    .option("-o, --output <file>", "Save response HTML to file")
    .option("-s, --school <id>", "Override school ID")
    .option("--json", "Output as JSON")
    .option("--no-follow", "Don't follow redirects on the POST")
    .option(
      "--dump-body",
      "Print the POST body that would be sent (dry run, no POST)"
    )
    .action(async (path, options) => {
      const {
        target,
        argument,
        form,
        output,
        school,
        json,
        follow,
        dumpBody,
      } = options;

      try {
        if (!isSessionValid()) {
          printError(
            "Not authenticated or session expired. Run 'lectio auth' first.",
            json
          );
          process.exit(1);
        }

        const schoolId = school ?? getCurrentSchoolId();
        const schoolName = getCurrentSchoolName();

        // Step 1: GET the page
        const spinner = json
          ? null
          : createSpinner(`GET ${path}...`);
        spinner?.start();

        const getResult = await fetchLectio(path, { schoolId });

        if (spinner) {
          success(spinner, `GET ${getResult.url} (${getResult.status})`);
        }

        // Step 2: Extract ASP.NET hidden fields
        const aspData = extractASPData(getResult.body, target);

        // Override __EVENTARGUMENT if provided
        if (argument) {
          aspData.__EVENTARGUMENT = argument;
        }

        // Step 3: Merge extra form fields
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

        const body = buildPostBody(aspData, extraFields);

        // Dry run: just print the body
        if (dumpBody) {
          if (json) {
            console.log(
              JSON.stringify({
                success: true,
                dryRun: true,
                url: getResult.url,
                target,
                argument: argument || "",
                aspFields: aspData,
                extraFields,
                body,
              }, null, 2)
            );
          } else {
            console.log(chalk.bold.underline("POST Body (dry run)"));
            console.log();
            // Pretty-print the URL params
            const params = new URLSearchParams(body);
            for (const [key, value] of params.entries()) {
              const display =
                value.length > 80
                  ? value.slice(0, 77) + "..."
                  : value || chalk.gray("(empty)");
              console.log(
                `  ${chalk.yellow(key.padEnd(30))} ${display}`
              );
            }
            console.log();
            console.log(
              chalk.gray(`Total body size: ${body.length} bytes`)
            );
          }
          return;
        }

        // Step 4: POST back
        const postSpinner = json
          ? null
          : createSpinner(`POST ${path} (target: ${target})...`);
        postSpinner?.start();

        const postResult = await fetchLectio(path, {
          schoolId,
          method: "POST",
          body,
          followRedirects: follow,
        });

        if (postSpinner) {
          success(
            postSpinner,
            `POST ${postResult.url} (${postResult.status})`
          );
        }

        // Output
        if (json) {
          console.log(
            JSON.stringify({
              success: true,
              status: postResult.status,
              url: postResult.url,
              redirected: postResult.redirected,
              headers: postResult.headers,
              body: postResult.body,
              school: schoolId
                ? { id: schoolId, name: schoolName }
                : undefined,
            })
          );
        } else if (output) {
          writeFileSync(output, postResult.body, "utf-8");
          console.log(
            chalk.green("\u2713") + ` Saved to ${chalk.bold(output)}`
          );
          console.log(chalk.gray(`  ${postResult.body.length} bytes`));
        } else {
          console.log(postResult.body);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        printError(message, json);
        process.exit(1);
      }
    });
}

function fieldCommand(): Command {
  return new Command("field")
    .description("Extract a specific field value from a page by its ID")
    .argument("<path>", "Page path (e.g., ElevAflevering.aspx?elevid=123)")
    .argument("<field-id>", "The field ID to extract (e.g., s_m_Content_Content_MyField)")
    .option("-s, --school <id>", "Override school ID")
    .option("--json", "Output as JSON")
    .action(async (path, fieldId, options) => {
      const { school, json } = options;

      try {
        if (!isSessionValid()) {
          printError(
            "Not authenticated or session expired. Run 'lectio auth' first.",
            json
          );
          process.exit(1);
        }

        const schoolId = school ?? getCurrentSchoolId();
        const spinner = json ? null : createSpinner(`Fetching ${path}...`);
        spinner?.start();

        const result = await fetchLectio(path, { schoolId });

        if (spinner) {
          success(spinner, `Fetched ${result.url} (${result.status})`);
        }

        const value = extractFieldById(result.body, fieldId);

        if (json) {
          console.log(
            JSON.stringify({
              success: true,
              url: result.url,
              fieldId,
              value,
              found: value !== null,
            })
          );
        } else if (value !== null) {
          console.log(value);
        } else {
          console.error(
            chalk.yellow("Field not found:"),
            chalk.cyan(fieldId)
          );
          process.exit(1);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        printError(message, json);
        process.exit(1);
      }
    });
}

function printError(message: string, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(chalk.red("Error:"), message);
  }
}
