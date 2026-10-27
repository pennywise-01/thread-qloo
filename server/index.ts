import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CITIES, resolveCity } from '../shared/cities';
import { INTERESTS } from '../shared/thread';
import { getQlooPort, qlooMode } from './qloo';
import { allInterestTags } from './qloo/tags';
import { checkRuntime } from './runtime-check';
import { planThread, ThreadError } from './thread/engine';
import { probeCity } from './thread/probe';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file. Environment variables from the shell are used instead.
}

checkRuntime();

const app = express();
const port = Number(process.env.PORT ?? 8787);
const mode = qlooMode();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api/thread/options', (_request, response) => {
  response.json({
    mode,
    cities: CITIES,
    interests: INTERESTS,
    budgets: [
      { value: 1, label: 'Budget', hint: 'cheap for this city — markets, counters, standing bars' },
      { value: 2, label: 'Mid', hint: 'a normal night out — most shops, live houses, a good dinner' },
      { value: 3, label: 'Any', hint: '' },
    ],
  });
});

/**
 * What this city actually has. One cached Qloo call (~5-8s cold, instant after).
 * Returns `live: false` with no supply in mock mode, and the client then shows
 * every interest unbadged rather than hiding options.
 */
app.get('/api/thread/availability', async (request, response) => {
  const requested = String(request.query.city ?? '');
  const resolved = resolveCity(requested);

  if (!resolved.name) {
    response.status(400).json({ error: 'Pick a city.' });
    return;
  }

  const started = Date.now();
  const probe = await probeCity(resolved.name, getQlooPort());

  response.json({
    city: resolved.name,
    cityId: resolved.city?.id ?? null,
    live: mode === 'live',
    sampled: probe?.sampled ?? 0,
    supply: probe?.supply ?? {},
    measured: probe?.measured ?? [],
    ms: Date.now() - started,
  });
});

app.post('/api/thread', async (request, response) => {
  try {
    const result = await planThread(
      {
        city: String(request.body?.city ?? ''),
        days: Number(request.body?.days ?? 0),
        interests: Array.isArray(request.body?.interests) ? request.body.interests : [],
        budget: Number(request.body?.budget ?? 0) as 1 | 2 | 3,
      },
      getQlooPort(),
    );
    response.json(result);
  } catch (error) {
    if (error instanceof ThreadError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    console.error('[thread]', error);
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected error' });
  }
});

const clientDir = path.join(process.cwd(), 'dist', 'client');

if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(path.join(clientDir, 'index.html'));
  });
} else {
  app.get('/', (_request, response) => {
    response
      .type('text/plain')
      .send(
        [
          'Thread API is running.',
          '',
          'The client bundle is not built. In development open the Vite server on :5173.',
          'For a single process, run `npm run build` and restart.',
        ].join('\n'),
      );
  });
}

app.listen(port, () => {
  console.log(`Thread on http://localhost:${port} — ${mode === 'live' ? 'LIVE Qloo' : 'MOCK ranking'}`);

  // Warm the caches in the background. Resolving twelve interest tags from
  // scratch takes ~35s on a 2-vCPU box, and nobody should pay that on their
  // first city selection.
  void (async () => {
    const qloo = getQlooPort();
    await allInterestTags(qloo).catch(() => undefined);
    await probeCity('Tokyo', qloo).catch(() => undefined);
  })();
});
