#!/usr/bin/env node
// Thin wrapper so probes pick up .env without putting the key on a command line.
// Usage: node scripts/qloo-probe.mjs api search --query "Pit Inn" --json
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

try {
  process.loadEnvFile('.env');
} catch {
  // fall through to the shell environment
}

const HARNESS_ENTRY = path.join('node_modules', '@qloo', 'qloo-harness', 'dist', 'bin.js');
const bin = process.env.QLOO_BIN ?? 'qloo';

let command = bin;
let prefix = [];
if (process.platform === 'win32') {
  const candidates = [
    path.join(path.dirname(process.execPath), HARNESS_ENTRY),
    path.join(process.env.APPDATA ?? '', 'npm', HARNESS_ENTRY),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) {
    command = process.execPath;
    prefix = [found];
  }
}

const args = [...prefix, ...process.argv.slice(2)];
try {
  const { stdout, stderr } = await promisify(execFile)(command, args, {
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: process.env,
  });
  process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  process.exitCode = error.code ?? 1;
}
