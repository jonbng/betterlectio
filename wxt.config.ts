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
        resources: ['assets/*'],
        matches: ['*://*.lectio.dk/*'],
      },
    ],
    // Declared on the config (not only the generate hook) so WXT 0.21 sees
    // the Firefox ID / data-collection permissions and skips those warnings.
    // Stripped from Chrome/Safari manifests.
    browser_specific_settings: {
      gecko: {
        id: '{c3b94c3b-a7d2-4130-9adc-75cc174b0aaa}',
        strict_min_version: '109.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  hooks: {
    // Keep WXT 0.20 compiler options. v0.21's generated tsconfig turns on
    // verbatimModuleSyntax, noUncheckedIndexedAccess, and a DOM lib that
    // clash with this Preact + @types/react setup (~570 tsc errors).
    'prepare:tsconfig': (_wxt, { tsconfig }) => {
      const opts = tsconfig.compilerOptions;
      delete opts.lib;
      opts.module = 'ESNext';
      delete opts.moduleDetection;
      delete opts.allowImportingTsExtensions;
      delete opts.verbatimModuleSyntax;
      opts.esModuleInterop = true;
      opts.forceConsistentCasingInFileNames = true;
      opts.resolveJsonModule = true;
      delete opts.noFallthroughCasesInSwitch;
      delete opts.noUncheckedIndexedAccess;
      delete opts.noImplicitOverride;
    },
    'build:manifestGenerated': (wxt, manifest) => {
      // gecko lives on config.manifest so WXT's ID / data-collection
      // warnings stay quiet, but it must not ship on Chrome or Safari.
      if (wxt.config.browser !== 'firefox' && manifest.browser_specific_settings) {
        delete (manifest.browser_specific_settings as { gecko?: unknown }).gecko;
        if (Object.keys(manifest.browser_specific_settings).length === 0) {
          delete manifest.browser_specific_settings;
        }
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
    // WXT 0.21: includeSources - excludeSources. Default include is all
    // non-dot files, so an explicit allowlist keeps AMO sources to the
    // files needed to rebuild the extension.
    includeSources: [
      'entrypoints',
      'components',
      'lib',
      'hooks',
      'styles',
      'public',
      'package.json',
      'bun.lock',
      'tsconfig.json',
      'wxt.config.ts',
      'preact-compat.d.ts',
      'database.types.ts',
      'README.md',
      'LICENSE',
      'PRIVACY.md',
      'SOURCE_CODE_REVIEW.md',
    ],
    excludeSources: [
      '**/*.test.ts',
      'styles/globals.before-restore-recovery.css',
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
