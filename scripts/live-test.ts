import { planThread } from '../server/thread/engine';
import { ExecQlooAdapter } from '../server/qloo/exec';
import type { Budget, Interest } from '../shared/thread';

try {
  process.loadEnvFile('.env');
} catch {
  // shell env
}

const days = Number(process.argv[2] ?? 3);
const budget = Number(process.argv[3] ?? 2) as Budget;
const interests = (process.argv[4] ?? 'jazz,coffee,vinyl').split(',') as Interest[];

console.log(`live test: ${days} days, price tier ${budget}/3, interests ${interests.join(' + ')}`);

const started = Date.now();
const result = await planThread(
  { city: 'Tokyo', days, interests, budget },
  new ExecQlooAdapter(),
);
const elapsed = Date.now() - started;

console.log(`\nmode=${result.mode} · ${result.calls} Qloo calls · ${elapsed}ms`);
console.log(`signals: ${result.signals.join(', ') || '(none)'}`);
console.log(`places discovered: ${result.considered} · affordable: ${result.candidates}`);
console.log(`${result.plan.length}/${result.requestedDays} days\n`);

for (const day of result.plan) {
  console.log(`DAY ${day.index} — ${day.district.name}`);
  for (const stop of day.stops) {
    const leg =
      stop.travelMinutes === null
        ? ''
        : ` (+${stop.travelMinutes}m ${stop.travelMode === 'transit' ? 'train' : 'walk'})`;
    console.log(`  ${stop.window.padEnd(10)} ${stop.venue.name.slice(0, 42).padEnd(42)} ${stop.match}%${leg}`);
    console.log(`             ${stop.venue.kind} · tier ${stop.venue.price}/3 · ${stop.venue.note.slice(0, 80)}`);
  }
}

if (result.skipped.length) {
  console.log('\nSKIPPED');
  for (const entry of result.skipped) {
    console.log(`  ${entry.venue.name.slice(0, 42).padEnd(42)} ${entry.match}%  ${entry.reason}`);
  }
}
