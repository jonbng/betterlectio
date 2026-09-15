#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as cheerio from 'cheerio';

const [oldRoot, newRoot] = process.argv.slice(2);
if (!oldRoot || !newRoot) {
  console.error('Usage: node tools/compare-lectio-snapshots.mjs <old-root> <new-root>');
  process.exit(2);
}

function files(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(root, path) : entry.name.endsWith('.html') ? [relative(root, path)] : [];
  });
}

function stable(value) {
  return value
    .replace(/_ctl\d+/gi, '_ctl#')
    .replace(/\b\d{5,}\b/g, '#')
    .replace(/[a-f\d]{16,}/gi, '#');
}

function inspect(path) {
  const html = readFileSync(path, 'utf8');
  const $ = cheerio.load(html);
  const formAction = $('form[method="post"]').first().attr('action') ?? '';
  const error = /fejl(?:handled|side)\.aspx|LectioLog\.aspx/i.test(formAction)
    || $('body').text().includes('Du har ikke adgang')
    || $('body').text().includes('Du har s\u00f8gt efter en side, som ikke findes');
  const root = $('#s_m_Content_Content').length ? $('#s_m_Content_Content') : $('body');
  const tokens = new Set();
  const ids = new Set();
  const classes = new Set();

  root.find('*').each((_, node) => {
    const el = $(node);
    const tag = node.tagName?.toLowerCase();
    if (!tag || ['script', 'style', 'noscript'].includes(tag)) return;
    const id = el.attr('id');
    const classList = (el.attr('class') ?? '').split(/\s+/).filter(Boolean).map(stable).sort();
    if (id) ids.add(stable(id));
    classList.forEach((name) => classes.add(name));
    const attrs = Object.keys(node.attribs ?? {})
      .filter((name) => !['style', 'value', 'href', 'src', 'title', 'onclick'].includes(name))
      .sort();
    tokens.add(`${tag}${id ? `#${stable(id)}` : ''}${classList.map((name) => `.${name}`).join('')}[${attrs.join(',')}]`);
  });

  return {
    bytes: statSync(path).size,
    error,
    formAction: stable(formAction),
    tags: root.find('*').length,
    ids,
    classes,
    tokens,
  };
}

function setDiff(left, right) {
  return [...left].filter((item) => !right.has(item));
}

const rows = [];
for (const file of files(oldRoot).sort()) {
  const newPath = join(newRoot, file);
  try {
    statSync(newPath);
  } catch {
    rows.push({ file, status: 'missing' });
    continue;
  }
  const oldPage = inspect(join(oldRoot, file));
  const newPage = inspect(newPath);
  const removed = setDiff(oldPage.tokens, newPage.tokens);
  const added = setDiff(newPage.tokens, oldPage.tokens);
  const union = new Set([...oldPage.tokens, ...newPage.tokens]);
  const similarity = union.size ? 1 - ((removed.length + added.length) / union.size) : 1;
  rows.push({
    file,
    status: oldPage.error || newPage.error ? 'non-comparable' : 'comparable',
    similarity: Number(similarity.toFixed(4)),
    oldBytes: oldPage.bytes,
    newBytes: newPage.bytes,
    oldTags: oldPage.tags,
    newTags: newPage.tags,
    removedIds: setDiff(oldPage.ids, newPage.ids),
    addedIds: setDiff(newPage.ids, oldPage.ids),
    removedClasses: setDiff(oldPage.classes, newPage.classes),
    addedClasses: setDiff(newPage.classes, oldPage.classes),
    removedTokens: removed,
    addedTokens: added,
    oldAction: oldPage.formAction,
    newAction: newPage.formAction,
  });
}

console.log(JSON.stringify(rows, null, 2));
