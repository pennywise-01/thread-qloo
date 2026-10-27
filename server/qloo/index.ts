import { ExecQlooAdapter } from './exec';
import { MockQlooAdapter } from './mock';
import type { QlooPort } from './port';

let cached: QlooPort | null = null;

export function qlooMode(): 'mock' | 'live' {
  // The app talks to Qloo by default. `QLOO_MODE=mock` exists only for offline
  // fixture work and is not a supported way to run Thread.
  return process.env.QLOO_MODE === 'mock' ? 'mock' : 'live';
}

export function getQlooPort(): QlooPort {
  if (cached) return cached;
  cached = qlooMode() === 'live' ? new ExecQlooAdapter() : new MockQlooAdapter();
  return cached;
}
