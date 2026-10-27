import { mkdir, writeFile } from 'node:fs/promises';
import type { Interest } from '../shared/thread';
import { CITIES } from '../shared/cities';
import { ExecQlooAdapter } from '../server/qloo/exec';
import { probeCity } from '../server/thread/probe';

/**
 * Probe every city in the catalog once and write a coverage report.
 *
 * The point is to prune dead entries rather than ship a dropdown with options
 * that return nothing. Run it with a limit first if quota is tight:
 *
 *   npx tsx scripts/cities-check.ts 20
 */
try {
  process.loadEnvFile('.env');
} catch {
  // shell env
}

const limit = Number(process.argv[2] ?? 0) || CITIES.length;
const queue = CITIES.slice(0, limit);
const total = queue.length;
const port = new ExecQlooAdapter();

const MIN_SAMPLE = 10;
const MIN_INTERESTS = 3;

interface Row {
  id: string;
  name: string;
  country: string;
  sampled: number;
  interestsWithSupply: number;
  top: string;
  thin: boolean;
  error?: string;
}

const rows: Row[] = [];
let done = 0;

async function save() {
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/city-coverage.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        probe: { minSample: MIN_SAMPLE, minInterests: MIN_INTERESTS },
        total,
        completed: rows.length,
        thin: rows.filter((row) => row.thin).map((row) => row.id),
        cities: rows,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function summarise(row: Row) {
  const mark = row.error ? 'ERR' : row.thin ? 'thin' : 'ok  ';
  console.log(
    `${mark.padEnd(4)} ${row.name.padEnd(18)} ${String(row.sampled).padStart(3)} sampled · ` +
      `${String(row.interestsWithSupply).padStart(2)} interests · ${row.top}${row.error ? ' · ' + row.error : ''}`,
  );
}

async function worker() {
  for (;;) {
    const city = queue.shift();
    if (!city) return;

    let row: Row;
    try {
      const probe = await probeCity(city.name, port);
      if (!probe) {
        row = { ...city, sampled: 0, interestsWithSupply: 0, top: '—', thin: true, error: 'no probe' };
      } else {
        const entries = Object.entries(probe.supply) as [Interest, number][];
        const withSupply = entries.filter(([, count]) => count > 0);
        const top = withSupply
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([interest, count]) => `${interest} ${count}`)
          .join(', ');
        row = {
          id: city.id,
          name: city.name,
          country: city.country,
          sampled: probe.sampled,
          interestsWithSupply: withSupply.length,
          top: top || '—',
          thin: probe.sampled < MIN_SAMPLE || withSupply.length < MIN_INTERESTS,
        };
      }
    } catch (error) {
      row = {
        ...city,
        sampled: 0,
        interestsWithSupply: 0,
        top: '—',
        thin: true,
        error: error instanceof Error ? error.message.slice(0, 60) : 'failed',
      };
    }

    rows.push(row);
    done += 1;
    summarise(row);
    if (done % 10 === 0 || done === total) await save();
  }
}

console.log(`probing ${total} cities, 3 at a time…\n`);
await Promise.all([worker(), worker(), worker()]);
await save();

const thin = rows.filter((row) => row.thin);
console.log(`\n${rows.length} probed · ${thin.length} thin`);
if (thin.length > 0) {
  console.log('thin:', thin.map((row) => `${row.name} (${row.sampled})`).join(', '));
}
console.log('wrote reports/city-coverage.json');
