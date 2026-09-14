import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function manifest(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

const production = await manifest('../.output/chrome-mv3/manifest.json');
const admin = await manifest('../.output-admin/chrome-mv3-admin/manifest.json');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hasPermission = (value, permission) => value.permissions?.includes(permission) === true;
const hasLectioHost = (value) => value.host_permissions?.some((host) => host.includes('lectio.dk')) === true;
const hasAdminBridge = (value) => value.content_scripts?.some((entry) =>
  entry.js?.some((file) => file.includes('admin-handoff')),
) === true;

async function outputContains(directory, needles) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await outputContains(file, needles)) return true;
    } else {
      const contents = await readFile(file, 'utf8').catch(() => '');
      if (needles.some((needle) => contents.includes(needle))) return true;
    }
  }
  return false;
}

assert(production.name === 'Better Lectio', 'Production extension name changed');
assert(!hasPermission(production, 'cookies'), 'Production manifest must not request cookies');
assert(!hasLectioHost(production), 'Production manifest must not request Lectio host access');
assert(!production.action?.default_popup, 'Production manifest must not include the admin popup');
assert(!hasAdminBridge(production), 'Production manifest must not include the admin handoff bridge');
assert(!production.key, 'Production manifest must not use the admin Chromium identity');
assert(
  !(await outputContains(fileURLToPath(new URL('../.output/chrome-mv3/', import.meta.url)), [
    'bl-admin:redeem-handoff',
    'betterlectio:admin-handoff',
    '/api/extension/lectio-session-handoff',
  ])),
  'Production bundle must not contain admin handoff code',
);

assert(admin.name === 'Better Lectio Admin', 'Admin extension must have a distinct name');
assert(hasPermission(admin, 'cookies'), 'Admin manifest must request cookies');
assert(hasLectioHost(admin), 'Admin manifest must request Lectio host access');
assert(!admin.action?.default_popup, 'Admin handoff must be initiated from the authenticated dashboard');
assert(hasAdminBridge(admin), 'Admin manifest must include the dashboard handoff bridge');
assert(typeof admin.key === 'string' && admin.key.length > 100, 'Admin manifest must use a separate Chromium identity');

console.log('Admin build isolation verified');
