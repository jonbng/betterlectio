import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Better Lectio',
    description: 'Gør Lectio suverent bedre. Installér mobil appen også!',
    version: '0.0.25',
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
