import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Better Lectio',
    description: 'Gør Lectio suverent bedre. Installér mobil appen også!',
    // No `version` key — WXT falls back to package.json's version, which
    // .github/workflows/release.yml bumps. Keeping it in one place only.
    author: 'Jonathan Bangert <betterlectio@jonathanb.dk>' as any,
    homepage_url: 'https://github.com/jonbng/betterlectio',
    action: {
      default_title: 'Better Lectio',
    },
    permissions: ['activeTab', 'storage'],
    host_permissions: [
      `${process.env.VITE_SUPABASE_URL || 'https://*.supabase.co'}/*`,
      'https://eu.i.posthog.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['assets/*', 'vendor/userjot/**', 'userjot-bootstrap.js'],
        matches: ['*://*.lectio.dk/*'],
      },
    ],
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox') {
        manifest.browser_specific_settings = {
          gecko: {
            id: '{c3b94c3b-a7d2-4130-9adc-75cc174b0aaa}',
            strict_min_version: '109.0',
            data_collection_permissions: {
              required: ['none'],
            },
          },
        };
      }
      if (wxt.config.browser === 'safari') {
        // Safari ships as a macOS-only Safari Web Extension (MV3) bundled inside
        // the BetterLectio Mac app. Built via `bun run build:safari` (--mv3) and
        // vendored into the mobile repo by scripts/sync-safari-extension.sh.
        manifest.name = 'BetterLectio';
        if (manifest.action && typeof manifest.action === 'object') {
          manifest.action.default_title = 'BetterLectio';
        }

        // `world: "MAIN"` on content_scripts requires Safari 18; MV3 service
        // workers require 16.4. The Mac app targets macOS 15, which ships
        // Safari 18 and can't be downgraded below it — so both are guaranteed
        // and no manifest workarounds are needed.
        manifest.browser_specific_settings = {
          ...(manifest.browser_specific_settings ?? {}),
          safari: { strict_min_version: '18.0' },
        };

        // Safari does NOT apply the host_permissions CORS bypass to a background
        // *service worker* — only to a background page/event page. Every Supabase
        // and PostHog request originates in entrypoints/background.ts, so emit
        // `scripts` alongside `service_worker`; Safari prefers `scripts` unless
        // `preferred_environment` says otherwise, while Chrome-shaped tooling
        // still sees a valid SW key. Safe because defineBackground() is called
        // with no options, so WXT emits a classic (non-module) script.
        // https://github.com/JamiesWhiteShirt/safari-service-worker-background-bug
        const background = manifest.background as
          | { service_worker?: string; scripts?: string[]; persistent?: boolean }
          | undefined;
        if (background?.service_worker) {
          background.scripts = [background.service_worker];
          delete background.persistent; // MV2-only key, meaningless in MV3
        }
      }
    },
  },
  webExt: {
    startUrls: ['https://www.lectio.dk/'],
  },
  zip: {
    excludeSources: [
      // Build dependencies and artifacts
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      // Reference materials (flagged by Mozilla)
      'lectio-html/**',
      'lectio-scripts/**',
      'tools/**',
      // Sensitive/config files
      '.env',
      '.claude/**',
      '.mcp.json',
      // CI/CD and docs
      '.github/**',
      'docs/**',
      '.cursor/**',
      // Store listing assets (not part of extension)
      'chrome-*.svg',
      'firefox-*.svg',
      'screenshots/**',
      // Development docs
      'CLAUDE.md',
      'AGENTS.md',
      'ARCHITECTURE.md',
      'SOURCE_CODE_REVIEW.md',
      'web-ext.config.ts',
      'admin/**',
      'supabase/**',
      'website/**',
      // Flutter mobile app (separate project, not part of the extension)
      'android/**',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      // Use posthog-node's edge build (no Node.js-specific APIs like async_hooks)
      // so it works in browser extension content scripts and service workers.
      conditions: ['edge', 'edge-light', 'workerd', 'browser', 'import', 'module', 'default'],
      alias: {
        '@': path.resolve(__dirname, './'),
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
