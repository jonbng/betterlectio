<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="public/assets/logo-transparent.png">
    <img src="public/assets/logo-transparent.png" alt="BetterLectio Logo" width="128" height="128">
  </picture>
</p>

<h1 align="center">BetterLectio</h1>

<p align="center">
  A browser extension that modernizes <a href="https://www.lectio.dk/">Lectio</a>, the Danish school management system.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

---

## Features

- **Modern Sidebar** — Clean navigation with collapsible sections for schedules and changes
- **Fast Search** — Quickly find students, teachers, rooms, and classes with keyboard shortcuts (Cmd/Ctrl+K)
- **Smart Prefetching** — Pages load instantly using Speculation Rules API and hover prefetching
- **Improved Messages** — Two-column layout with folder tree, auto-redirects to newest messages
- **Profile Pictures** — Click to enlarge any profile picture to full size
- **Skeleton Loading** — Smooth transitions with no flash of unstyled content
- **Cross-Page Profiles** — Your profile stays visible when viewing other students' schedules

## Installation

<p align="center">
  <a href="https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="chrome-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="chrome-light.svg">
      <img src="chrome-dark.svg" alt="Add to Chrome" height="60">
    </picture>
  </a>
  &nbsp;&nbsp;
  <a href="https://addons.mozilla.org/en-US/firefox/addon/betterlectio/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="firefox-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="firefox-light.svg">
      <img src="firefox-dark.svg" alt="Add to Firefox" height="60">
    </picture>
  </a>
</p>

### From Source

1. Clone this repository
2. Run `bun install` to install dependencies
3. Run `bun run build` for Chrome or `bun run build:firefox` for Firefox
4. Load the extension:
   - **Chrome:** Go to `chrome://extensions`, enable Developer mode, click "Load unpacked" and select `.output/chrome-mv3`
   - **Firefox:** Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on" and select any file in `.output/firefox-mv2`

## Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js

### Commands

```bash
# Install dependencies
bun install

# Start development server
bun run dev          # Chrome
bun run dev:firefox  # Firefox

# Build for production
bun run build          # Chrome
bun run build:firefox  # Firefox

# Package for distribution
bun run zip          # Chrome
bun run zip:firefox  # Firefox
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [WXT](https://wxt.dev/) | Browser extension framework |
| [Preact](https://preactjs.com/) | Lightweight React alternative (3KB) |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) | UI component system |
| [Radix UI](https://www.radix-ui.com/) | Accessible primitives |

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome | Supported (Manifest V3) |
| Firefox | Supported (Manifest V2) |
| Edge | Should work (untested) |

## Acknowledgements

Name inspired by [BetterLectio](https://github.com/BetterLectio).

## License

GPLv3
