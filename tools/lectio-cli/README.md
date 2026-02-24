# Lectio CLI

A command-line tool for authenticated access to Lectio, the Danish school management system. Designed for developers working on browser extensions or tools that need to fetch raw HTML from Lectio endpoints.

## Features

- **Browser-based authentication** - Opens Chrome for you to log in, captures cookies automatically
- **School selection** - Search and select from 280+ Danish schools
- **Authenticated GET & POST requests** - Fetch or submit to any Lectio page with your session
- **Session management** - Tracks session validity, prompts for re-auth when expired
- **JSON output mode** - All commands support `--json` for scripting and AI agents
- **Cross-platform** - Works on macOS, Linux, and Windows
- **Secure storage** - Cookies stored in `~/.lectio-cli/`, outside the repo

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
```

**Body input options (one required):**
- `--data` / `-d` — Raw body string (typically URL-encoded)
- `--data-file` / `-f` — Read body from a file
- `--form` — Key=value pairs, auto-encoded as `application/x-www-form-urlencoded`

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
└── schools-cache.json   # Cached school list (refreshed weekly)
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

Lectio sessions expire after ~60 minutes of inactivity. The CLI doesn't keep sessions alive automatically. Re-authenticate when needed:

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
- **Session validation** - Sessions are checked before each request

## License

Part of the BetterLectio project.
