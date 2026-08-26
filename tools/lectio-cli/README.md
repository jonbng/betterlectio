# Lectio CLI

A command-line tool for authenticated access to Lectio, the Danish school management system. Designed for developers working on browser extensions or tools that need to fetch raw HTML from Lectio endpoints.

## Features

- **Browser-based authentication** - Opens Chrome for you to log in, captures cookies automatically
- **School selection** - Search and select from 280+ Danish schools
- **Authenticated GET & POST requests** - Fetch or submit to any Lectio page with your session
- **ASP.NET WebForms helpers** - Inspect hidden fields, extract postback targets, and build valid postback bodies
- **Built-in postback flow** - Run `GET -> extract ASP state -> POST` from `lectio asp postback` or `lectio post --asp-target`
- **Session keepalive daemon** - Background pings to keep sessions alive between interactions
- **Session management** - Tracks session validity, prompts for re-auth when expired
- **JSON output mode** - All commands support `--json` for scripting and AI agents
- **Cross-platform** - Works on macOS, Linux, and Windows
- **Secure storage** - Cookies stored in `~/.lectio-cli/`, outside the repo
- **Consented session import** - Imports an encrypted, allowlisted donor session from Supabase

## Installation

```bash
cd tools/lectio-cli
bun install
```

### Global Installation (Optional)

```bash
bun link
# Now you can use 'lectio' from anywhere
```

### Development Usage

```bash
bun run src/index.ts <command>
# Or use the alias:
bun run dev <command>
```

## Commands

### `lectio auth` - Authenticate with Lectio

Opens a browser window for you to log in. Once authenticated, cookies are saved locally.

```bash
# Interactive mode - prompts for school selection
lectio auth

# Direct authentication with school ID
lectio auth --school 94

# Search for school by name
lectio auth --search "sorø"

# Force re-authentication (even if session valid)
lectio auth --force

# Output as JSON (for scripting)
lectio auth --json
```

**How it works:**
1. Launches Chrome with a temporary profile
2. Navigates to the school's login page
3. Waits for you to log in (via browser)
4. Detects successful login via cookies
5. Saves cookies and closes browser

### `lectio fetch` - Fetch a page from Lectio

Retrieves authenticated pages from Lectio.

```bash
# Fetch schedule page (output to stdout)
lectio fetch skemany.aspx

# Save to file
lectio fetch skemany.aspx -o schedule.html

# Fetch with query parameters
lectio fetch "FindSkema.aspx?type=elev"

# Override school (uses different school than authenticated)
lectio fetch skemany.aspx --school 51

# Output as JSON with headers
lectio fetch skemany.aspx --json

# Don't follow redirects
lectio fetch forside.aspx --no-follow

# Inspect ASP.NET state on fetched page
lectio fetch beskeder2.aspx --asp
```

**Common pages:**
- `skemany.aspx` - Schedule
- `forside.aspx` - Home page
- `beskeder2.aspx` - Messages
- `FindSkema.aspx?type=elev` - Find schedule (student)
- `FindSkema.aspx?type=laerer` - Find schedule (teacher)
- `grades/grade_report.aspx` - Grades

### `lectio post` - Send a POST request to Lectio

Sends authenticated POST requests to Lectio endpoints.

```bash
# Post form data (URL-encoded string)
lectio post ElevAflevering.aspx -d "__EVENTTARGET=btn&comment=hello"

# Post with key=value form fields
lectio post ElevAflevering.aspx --form __EVENTTARGET=btn comment=hello

# Read body from a file
lectio post ElevAflevering.aspx --data-file body.txt

# Custom Content-Type (e.g., JSON)
lectio post some-endpoint.aspx -d '{"key":"value"}' -t "application/json"

# Save response to file
lectio post ElevAflevering.aspx --form key=val -o response.html

# Output as JSON with headers
lectio post ElevAflevering.aspx -d "data=1" --json

# Don't follow redirects
lectio post forside.aspx -d "data=1" --no-follow

# ASP.NET WebForms mode: auto GET + extract + POST
lectio post beskeder2.aspx --asp-target 'm$Content$aktelvbtn2' --form __LASTFOCUS=
```

**Body input options (one required):**
- `--data` / `-d` — Raw body string (typically URL-encoded)
- `--data-file` / `-f` — Read body from a file
- `--form` — Key=value pairs, auto-encoded as `application/x-www-form-urlencoded`
- `--asp-target` — Auto-extract ASP.NET state and send a valid postback body

### `lectio asp` - ASP.NET WebForms utilities

Utilities for inspecting and interacting with WebForms pages used by Lectio.

```bash
# Inspect ASP.NET fields + form fields + postback targets
lectio asp inspect beskeder2.aspx

# Only show postback targets
lectio asp inspect beskeder2.aspx --targets

# Trigger postback with full GET -> extract -> POST flow
lectio asp postback beskeder2.aspx -t 'm$Content$aktelvbtn2' --form __LASTFOCUS=

# Set __EVENTARGUMENT explicitly
lectio asp postback beskeder2.aspx -t 'm$Content$aktelvbtn2' --argument "some-arg"

# Dry-run: print POST body without sending
lectio asp postback beskeder2.aspx -t 'm$Content$aktelvbtn2' --dump-body

# Extract one field by ASP.NET ID
lectio asp field ElevAflevering.aspx?elevid=123 s_m_Content_Content_ExerciseName
```

Subcommands:
- `inspect <path>` — Fetch page and show parsed ASP.NET fields/form fields/postback targets
- `postback <path> -t <target>` — Standard ASP.NET postback flow with optional `--form` and `--argument`
- `field <path> <id>` — Extract a single field value by element ID

### `lectio keepalive` - Keep session alive in background

Runs a daemon that periodically pings `forside.aspx` and persists updated cookies.

```bash
# Start daemon (default interval: 600s = 10 min)
lectio keepalive start

# Custom interval (minimum 30s)
lectio keepalive start --interval 300

# Check daemon + session state
lectio keepalive status

# One foreground ping
lectio keepalive ping

# Show recent daemon log lines
lectio keepalive log -n 50

# Stop daemon
lectio keepalive stop
```

### `lectio schools` - List and search schools

```bash
# List all schools
lectio schools

# Search by name (fuzzy matching)
lectio schools --search "gymnasium"
lectio schools --search "sorø"

# Output as JSON
lectio schools --json

# Refresh the cached school list
lectio schools --refresh

# Show only the count
lectio schools --count
```

### `lectio status` - Show session status

```bash
# Show current session info
lectio status

# Output as JSON
lectio status --json
```

Example output:
```
Session Status
────────────────────────────────────────
Authenticated: Yes
School: Sorø Akademis Skole (ID: 94)
Session: Valid
Expires in: 52m 30s
Last activity: 2 minutes ago
```

### `lectio session import` - Import a consented test session

This administrative command uses credentials from environment variables only;
secrets are never accepted as command-line arguments or printed.

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
export LECTIO_SESSION_MASTER_KEY_V1="..." # base64-encoded 32-byte key
lectio session import --student <student-id> --school <school-id>
```

The imported jar replaces `~/.lectio-cli/cookies.json`, whose permissions are
restricted to the current OS user (`0600`). Only an active database grant can be
exported, and each successful export creates a metadata-only audit record.

### `lectio config` - Configuration management

```bash
# Show current configuration
lectio config

# Show config directory path
lectio config --path

# Set custom Chrome path
lectio config --set chromePath="/usr/bin/chromium"

# Clear a config value
lectio config --set chromePath=

# Reset to defaults
lectio config --reset

# Output as JSON
lectio config --json
```

**Available config options:**
- `chromePath` - Path to Chrome/Chromium executable (default: auto-detect)
- `defaultOutputDir` - Default directory for saving files (default: current directory)

## Storage

All data is stored in `~/.lectio-cli/`:

```
~/.lectio-cli/
├── config.json          # Settings (last school, chrome path)
├── cookies.json         # Authentication cookies
├── schools-cache.json   # Cached school list (refreshed weekly)
├── keepalive.pid        # Running keepalive daemon PID + interval
└── keepalive.log        # Keepalive ping log
```

**Note:** The storage directory is outside the repository to prevent accidental commits of sensitive data.

## JSON Output Mode

All commands support the `--json` flag for machine-readable output, making it easy to use with scripts or AI agents.

```bash
# Check if authenticated
lectio status --json
# {"authenticated":true,"school":{"id":"94","name":"Sorø Akademis Skole"},"session":{"valid":true,"expiresIn":3150,"lastActivity":"2024-01-10T12:30:00.000Z"}}

# Fetch a page
lectio fetch skemany.aspx --json
# {"success":true,"status":200,"url":"https://www.lectio.dk/lectio/94/skemany.aspx","body":"<!DOCTYPE html>...","headers":{...}}

# List schools
lectio schools --json --search "gymnasium"
# {"success":true,"count":45,"schools":[{"id":"51","name":"Allerød Gymnasium",...},...]}

# Inspect ASP.NET targets as JSON
lectio asp inspect beskeder2.aspx --json --targets
# {"success":true,"url":"...","postbackTargets":[...]}
```

## Error Handling

The CLI provides clear error messages:

- **Not authenticated:** Run `lectio auth` to log in
- **Session expired:** Run `lectio auth --force` to re-authenticate
- **Chrome not found:** Install Chrome or set path with `lectio config --set chromePath=...`
- **School not found:** Check the school ID with `lectio schools --search`

## Session Management

Lectio sessions expire after approximately 60 minutes of inactivity. The CLI:

1. Checks session validity before each request
2. Warns when session is about to expire
3. Prompts for re-authentication when expired
4. Can keep sessions active via `lectio keepalive start`

To check your current session:
```bash
lectio status
```

## Examples

### Workflow: Setting up for the first time

```bash
# 1. Install dependencies
cd tools/lectio-cli
bun install

# 2. Find your school
bun run src/index.ts schools --search "sorø"

# 3. Authenticate
bun run src/index.ts auth --school 94

# 4. Fetch a page
bun run src/index.ts fetch skemany.aspx -o schedule.html
```

### Workflow: Fetch multiple pages

```bash
# Fetch schedule
lectio fetch skemany.aspx -o lectio-html/schedule.html

# Fetch messages
lectio fetch beskeder2.aspx -o lectio-html/messages.html

# Fetch grades
lectio fetch grades/grade_report.aspx -o lectio-html/grades.html
```

### Workflow: Use with scripts

```bash
# Check if authenticated before fetching
if lectio status --json | grep -q '"valid":true'; then
  lectio fetch skemany.aspx -o schedule.html
else
  echo "Please run 'lectio auth' first"
fi
```

### Workflow: Use with AI agents

```bash
# AI agent can check status
lectio status --json

# AI agent can fetch pages
lectio fetch skemany.aspx --json

# AI agent can search schools
lectio schools --json --search "gymnasium"
```

## Troubleshooting

### Chrome not found

The CLI auto-detects Chrome in common locations. If not found:

```bash
# Find Chrome manually
which google-chrome  # Linux
# /usr/bin/google-chrome

# Set the path
lectio config --set chromePath="/usr/bin/google-chrome"
```

### Browser doesn't open

Make sure you have Chrome or Chromium installed. The CLI requires a graphical environment for authentication.

### Session expires quickly

Lectio sessions expire after ~60 minutes of inactivity. Start the keepalive daemon to ping periodically:

```bash
lectio keepalive start
```

If your session is already expired:

```bash
lectio auth --force
```

### Cookies not saving

Check that `~/.lectio-cli/` is writable:

```bash
ls -la ~/.lectio-cli/
```

## Development

```bash
# Run TypeScript directly
bun run src/index.ts <command>

# Type check
bun run typecheck

# Build for distribution
bun run build
```

## Security Notes

- **No passwords stored** - Authentication happens in the browser; the CLI only captures cookies
- **Temporary browser profile** - Each auth session uses a fresh profile that's deleted after
- **Secure storage location** - Cookies stored in user home directory, not in the repo
- **Cookie capture scope** - Authentication captures all browser cookies, filtered to `lectio.dk`
- **Session validation** - Sessions are checked before each request

## License

Part of the BetterLectio project.
