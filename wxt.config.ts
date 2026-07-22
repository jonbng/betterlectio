import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Better Lectio',
    description: 'Gør Lectio suverent bedre. Installér mobil appen også!',
    version: '0.0.33',
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
        resources: ['assets/*'],
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
        manifest.name = 'BetterLectio';
        if (manifest.action && typeof manifest.action === 'object') {
          manifest.action.default_title = 'BetterLectio';
        }
        if (manifest.browser_action && typeof manifest.browser_action === 'object') {
          manifest.browser_action.default_title = 'BetterLectio';
        }
        // iOS/iPadOS don't support persistent background pages.
        if (manifest.background && typeof manifest.background === 'object') {
          (manifest.background as { persistent?: boolean }).persistent = false;
        }
        // Safari doesn't understand the `world` key on content scripts and
        // warns about it at validation time. Our only MAIN-world script
        // (session-renew) doesn't actually touch page globals — dispatched
        // DOM events still reach jQuery handlers from the isolated world.
        if (Array.isArray(manifest.content_scripts)) {
          for (const cs of manifest.content_scripts) {
            if (cs && typeof cs === 'object' && 'world' in cs) {
              delete (cs as { world?: string }).world;
            }
          }
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
