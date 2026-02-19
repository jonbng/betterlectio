import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'BetterLectio',
    description: 'Better styling and improved functionality for Lectio',
    version: '0.0.11',
    author: 'Jonathan Bangert <jonathan@bangert.dk>' as any,
    homepage_url: 'https://github.com/jonbng/betterlectio',
    action: {
      default_title: 'BetterLectio',
    },
    permissions: ['storage'],
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
    },
  },
  webExt: {
    startUrls: ['https://www.lectio.dk/'],
  },
  zip: {
    excludeSources: [
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
      // Store listing assets (not part of extension)
      'chrome-*.svg',
      'firefox-*.svg',
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
