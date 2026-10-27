import { planThread } from '../server/thread/engine';
import { MockQlooAdapter } from '../server/qloo/mock';
import type { Budget, Interest } from '../shared/thread';

interface Case {
  name: string;
  days: number;
  interests: Interest[];
  budget: Budget;
}

const CASES: Case[] = [
  { name: 'Records, coffee, indie rock', days: 3, interests: ['vinyl', 'coffee', 'indie-rock'], budget: 2 },
  { name: 'Jazz and books', days: 2, interests: ['jazz', 'books'], budget: 2 },
  { name: 'Cheap and loud', days: 2, interests: ['techno', 'ramen'], budget: 1 },
  {
    name: 'Everything, four days',
    days: 4,
    interests: ['vinyl', 'coffee', 'indie-rock', 'vintage', 'art', 'jazz'],
    budget: 3,
  },
  {
    name: 'Two weeks',
    days: 14,
    interests: ['vinyl', 'coffee', 'indie-rock', 'vintage', 'jazz', 'books'],
    budget: 3,
  },
  { name: 'Thirty days, impossible', days: 30, interests: ['jazz', 'film'], budget: 2 },
];

const bar = (match: number): string => {
  const filled = Math.max(1, Math.round(match / 5));
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, 20 - filled))}`;
};

const failures: string[] = [];

for (const testCase of CASES) {
  const result = await planThread(
    { city: 'Tokyo', days: testCase.days, interests: testCase.interests, budget: testCase.budget },
    new MockQlooAdapter(),
  );

  console.log('');
  console.log('='.repeat(76));
  console.log(`${testCase.name.toUpperCase()} — ${testCase.days} days, price tier ${testCase.budget}/3`);
  console.log('='.repeat(76));
  console.log(
    `${result.candidates} places affordable · filled ${result.plan.length}/${result.requestedDays} days · ${result.skipped.length} skipped`,
  );

  if (result.plan.length > testCase.days) {
    failures.push(`${testCase.name}: filled ${result.plan.length} days, asked for ${testCase.days}`);
  }
  if (result.plan.length === 0) {
    failures.push(`${testCase.name}: no days filled`);
  }

  const seen = new Set<string>();

  for (const day of result.plan) {
    console.log('');
    console.log(`DAY ${day.index} — ${day.district.name}`);
    console.log(`  ${day.district.character}`);
    console.log(`  ${day.stops.length} stop${day.stops.length === 1 ? '' : 's'} · ${day.summary}`);

    if (day.stops.length === 0) failures.push(`${testCase.name}: empty day ${day.index}`);
    if (day.stops.length > 3) failures.push(`${testCase.name}: ${day.stops.length} stops in one day`);

    const windows = new Set<string>();
    for (const stop of day.stops) {
      if (windows.has(stop.window)) {
        failures.push(`${testCase.name}: two ${stop.window} stops on day ${day.index}`);
      }
      windows.add(stop.window);

      if (seen.has(stop.venue.id)) {
        failures.push(`${testCase.name}: ${stop.venue.name} appears twice`);
      }
      seen.add(stop.venue.id);

      if (stop.match < 1 || stop.match > 100) {
        failures.push(`${testCase.name}: bad match ${stop.match}`);
      }
      if (stop.travelMinutes !== null && stop.travelMinutes > 45) {
        failures.push(
          `${testCase.name}: ${stop.travelMinutes} min ${stop.travelMode} inside ${day.district.name}`,
        );
      }

      const walk =
        stop.travelMinutes === null
          ? ''
          : ` +${stop.travelMinutes}m ${stop.travelMode === 'transit' ? 'train' : 'walk'}`;
      console.log(
        `    ${stop.window.padEnd(10)} ${stop.venue.name.padEnd(30)} ${stop.hits}/${
          testCase.interests.length
        }  ${bar(stop.match)}${walk}`,
      );
    }
  }

  if (result.skipped.length > 0) {
    console.log('');
    console.log('  SKIPPED');
    for (const entry of result.skipped) {
      console.log(
        `    ${entry.venue.name.padEnd(30)} ${entry.hits}/${testCase.interests.length}  ${entry.reason}`,
      );
    }
  }
}

console.log('');
if (failures.length > 0) {
  console.error('FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`PASS — ${CASES.length} itineraries: day counts, unique venues, one stop per window, walkable.`);
