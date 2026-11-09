#!/usr/bin/env node
/**
 * Pulls the league Google Sheet (each tab published as CSV) into src/data/league/.
 *
 * Setup: see docs/GOOGLE_SETUP.md. In short, publish each tab with
 * File > Share > Publish to web > (tab) > Comma-separated values, and paste
 * the links into league-sheets.json.
 *
 *   npm run sync           fetch now; exits 1 if any tab failed
 *   node ... --soft        used by `npm run build`: never fails the build
 *
 * A download only replaces the local file if it has the expected columns, so a
 * broken or unpublished tab can never wipe out good data; the site keeps the
 * last good copy and /data-check/ says which tab couldn't be read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, missingColumns } from '../src/lib/schema.mjs';

const soft = process.argv.includes('--soft');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src/data/league');
const statusFile = path.join(dataDir, '.sync-status.json');

const config = JSON.parse(fs.readFileSync(path.join(root, 'league-sheets.json'), 'utf8'));
const entries = Object.entries(config.tabs ?? {}).filter(([, url]) => String(url ?? '').trim());

if (!entries.length) {
  console.log('[sync] No Google Sheet links in league-sheets.json; using the CSV files in the repository.');
  process.exit(0);
}

/** Minimal CSV header reader (handles quoted headers). */
function headerRow(text) {
  const line = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

const status = { syncedAt: new Date().toISOString(), files: {} };
let failed = 0;

for (const [file, rawUrl] of entries) {
  const url = String(rawUrl).trim();
  try {
    if (!TABLES[file]) throw new Error(`unknown tab file "${file}" (expected one of: ${Object.keys(TABLES).join(', ')})`);
    if (!/^https:\/\//.test(url)) throw new Error('link must start with https://');
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`the link returned HTTP ${res.status}; is the tab still published?`);
    const type = res.headers.get('content-type') ?? '';
    const text = await res.text();
    if (/text\/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) {
      throw new Error('the link returned a web page, not CSV; publish the tab as "Comma-separated values (.csv)"');
    }
    const missing = missingColumns(file, headerRow(text));
    if (missing.length) throw new Error(`the first row is missing column(s): ${missing.join(', ')}`);
    // Google sends Windows line endings; store plain ones so a rebuild doesn't rewrite every file.
    const csv = text.replace(/\r\n?/g, '\n');
    fs.writeFileSync(path.join(dataDir, file), csv.endsWith('\n') ? csv : `${csv}\n`);
    status.files[file] = 'updated';
    console.log(`[sync] ✓ ${file}`);
  } catch (err) {
    failed++;
    status.files[file] = `error: ${err.message}`;
    console.error(`[sync] ✗ ${file}: ${err.message} (kept the last good copy)`);
  }
}

fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`);
console.log(`[sync] ${entries.length - failed} of ${entries.length} tab(s) updated.`);
process.exit(failed && !soft ? 1 : 0);
