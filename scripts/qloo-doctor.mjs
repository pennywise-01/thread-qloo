#!/usr/bin/env node
// Live-mode diagnostic. Run this the moment the event key lands, before you
// flip QLOO_MODE=live. It prints the raw harness output so you can confirm the
// shapes that server/qloo/exec.ts parses actually match reality.
//
// Usage: npm run qloo:doctor

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env; fall back to the shell environment or the harness config.
}

const run = promisify(execFile);

const HARNESS_ENTRY = path.join('node_modules', '@qloo', 'qloo-harness', 'dist', 'bin.js');

function resolveInvocation() {
  const bin = process.env.QLOO_BIN ?? 'qloo';
  if (process.platform !== 'win32') return { command: bin, prefix: [] };
  const candidates = [
    path.join(path.dirname(process.execPath), HARNESS_ENTRY),
    path.join(process.env.APPDATA ?? '', 'npm', HARNESS_ENTRY),
    path.join(process.env.ProgramFiles ?? '', 'nodejs', HARNESS_ENTRY),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: process.execPath, prefix: [candidate] };
  }
  return { command: bin, prefix: [] };
}

const { command, prefix } = resolveInvocation();

async function probe(label, args) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
  try {
    const { stdout, stderr } = await run(command, [...prefix, ...args], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: process.env,
    });
    if (stderr.trim()) console.log(`[stderr] ${stderr.trim().slice(0, 500)}`);
    const text = stdout.trim();
    console.log(text.length > 3000 ? `${text.slice(0, 3000)}\n… (${text.length} chars total)` : text);
    return text;
  } catch (error) {
    const stdout = error?.stdout?.trim();
    const stderr = error?.stderr?.trim();
    console.log(`[exit ${error?.code ?? 'error'}]`);
    if (stdout) console.log(stdout.slice(0, 3000));
    if (stderr) console.log(stderr.slice(0, 1000));
    return null;
  }
}

console.log('Thread — Qloo harness diagnostic');
console.log(`base url: ${process.env.QLOO_BASE_URL ?? '(unset; expected https://hackathon.api.qloo.com)'}`);
console.log(`api key:  ${process.env.QLOO_API_KEY ? 'present in env' : 'not in env (harness config may still hold it)'}`);

await probe('harness version', ['--version']);
const status = await probe('credential status', ['setup', '--status']);
const ready = status ? /Qloo data:\s*(?!.*no api credential)(?!.*learning mode).+/i.test(status) : false;

await probe('resolve shape · qloo api search', ['api', 'search', '--query', 'Fela Kuti', '--take', '3', '--json']);

const dir = await mkdtemp(path.join(tmpdir(), 'cg-doctor-'));
const file = path.join(dir, 'request.json');
try {
  await writeFile(file, JSON.stringify({ query: 'jazz', limit: 3 }), 'utf8');
  await probe('workflow shape · qloo exec find_tags', ['exec', 'find_tags', '--input-file', file]);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

console.log(`\n${'─'.repeat(70)}`);
console.log('What to check before switching QLOO_MODE=live:');
console.log('  1. `qloo setup --status` reports "Qloo data: ready".');
console.log('  2. `api search` returns ids you can feed back as signals.');
console.log('  3. `exec find_tags` returns { status, summary, results, result_count }.');
console.log('  4. Then run: qloo exec rank --input \'{"options":[...],"option_type":"urn:entity:place","signals":[...]}\'');
console.log('     Adjust server/qloo/exec.ts if the field names differ.');
console.log(`  5. Credential readiness from the status probe: ${ready ? 'READY' : 'NOT READY'}`);
console.log('');
