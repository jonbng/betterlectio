import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Better Lectio',
    description: 'Gør Lectio pænere og nemmere at bruge — med mørk tilstand, en ny sidebar og bedre beskeder.',
    version: '0.0.20',
    author: 'Jonathan Bangert <jonathan@bangert.dk>' as any,
    homepage_url: 'https://github.com/jonbng/betterlectio',
    action: {
      default_title: 'Better Lectio',
    },
    permissions: ['activeTab'],
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
      'ARCHITECTURE.md',
      'SOURCE_CODE_REVIEW.md',
      'web-ext.config.ts',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
