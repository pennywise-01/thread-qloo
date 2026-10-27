import { ExecQlooAdapter } from './exec';
import { MockQlooAdapter } from './mock';
import type { QlooPort } from './port';

let cached: QlooPort | null = null;

export function qlooMode(): 'mock' | 'live' {
  return process.env.QLOO_MODE === 'live' ? 'live' : 'mock';
}

export function getQlooPort(): QlooPort {
  if (cached) return cached;
  cached = qlooMode() === 'live' ? new ExecQlooAdapter() : new MockQlooAdapter();
  return cached;
}
