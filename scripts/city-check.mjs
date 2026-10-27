#!/usr/bin/env node
// Coverage check: does `--filter-location` work outside Tokyo, and how well?
// Usage: node scripts/city-check.mjs "Lisbon" "Reykjavik" ...
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

try {
  process.loadEnvFile('.env');
} catch {
  // shell env
}

const HARNESS_ENTRY = path.join('node_modules', '@qloo', 'qloo-harness', 'dist', 'bin.js');
let command = process.env.QLOO_BIN ?? 'qloo';
let prefix = [];
if (process.platform === 'win32') {
  const found = [
    path.join(path.dirname(process.execPath), HARNESS_ENTRY),
    path.join(process.env.APPDATA ?? '', 'npm', HARNESS_ENTRY),
  ].find((candidate) => existsSync(candidate));
  if (found) {
    command = process.execPath;
    prefix = [found];
  }
}

const run = promisify(execFile);

function parse(text) {
  const lines = String(text).trim().split(/\r?\n/);
  for (let end = lines.length; end > 0; end -= 1) {
    const candidate = lines.slice(0, end).join('\n').trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

const cities = process.argv.slice(2);
const signal = process.env.CHECK_SIGNAL ?? 'Miles Davis';
const take = Number(process.env.CHECK_TAKE ?? 10);

console.log(`signal: ${signal} · take ${take}\n`);
console.log(
  'city'.padEnd(18) + 'n'.padStart(4) + '  ' + 'countries'.padEnd(22) + 'top result',
);
console.log('-'.repeat(96));

for (const city of cities) {
  const started = Date.now();
  let data = null;
  let error = null;

  try {
    const { stdout } = await run(
      command,
      [
        ...prefix,
        'api',
        'insights',
        '--type',
        'urn:entity:place',
        '--signal-query',
        signal,
        '--filter-location',
        city,
        '--take',
        String(take),
        '--json',
      ],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: process.env },
    );
    data = parse(stdout);
  } catch (cause) {
    data = parse(cause.stdout ?? '');
    if (!data) error = (cause.stderr ?? cause.message ?? '').slice(0, 80);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const list = Array.isArray(data) ? data : [];
  const countries = [
    ...new Set(list.map((entry) => entry?.properties?.geocode?.country).filter(Boolean)),
  ];
  const first = list[0];
  const where = first?.properties?.geocode;
  const label = first
    ? `${first.name} (${where?.city ?? '?'}, ${where?.country_code ?? '?'})`
    : (error ?? 'no results');

  console.log(
    city.padEnd(18) +
      String(list.length).padStart(4) +
      '  ' +
      (countries.join(', ') || '—').slice(0, 21).padEnd(22) +
      ` ${label.slice(0, 42)}  [${elapsed}s]`,
  );
}
