import { ExecQlooAdapter } from '../server/qloo/exec';
import { discoverPlaces } from '../server/thread/discover';
import type { Interest } from '../shared/thread';

try {
  process.loadEnvFile('.env');
} catch {
  // shell env
}

const city = process.argv[2] ?? 'Lisbon';
const interests = (process.argv[3] ?? 'books,coffee').split(',') as Interest[];

const result = await discoverPlaces(interests, 2, city, new ExecQlooAdapter());

console.log(`city ${city} · calls ${result.calls} · unpriced ${result.unpriced}`);
console.log(`places kept: ${result.places.length}`);
for (const place of result.places) {
  console.log(
    `  ${place.place.name.slice(0, 34).padEnd(34)} ${place.place.primaryGenre.padEnd(22)} ${place.interests.join('+')}`,
  );
}
