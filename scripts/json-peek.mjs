import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const lines = text.split(/\r?\n/);

let data = null;
for (let i = lines.length; i > 0; i -= 1) {
  try {
    data = JSON.parse(lines.slice(0, i).join('\n'));
    break;
  } catch {
    continue;
  }
}

if (data === null) {
  console.log('could not parse; first 600 chars:\n', text.slice(0, 600));
  process.exit(1);
}

const arr = Array.isArray(data) ? data : (data.results ?? data.entities ?? []);
console.log('count:', arr.length);

if (arr.length > 0) {
  const first = arr[0];
  console.log('keys:', Object.keys(first).join(', '));
  console.log('property keys:', Object.keys(first.properties ?? {}).join(', '));
}

for (const entry of arr.slice(0, 12)) {
  const geocode = entry.properties?.geocode ?? {};
  const tags = (entry.tags ?? []).slice(0, 4).map((tag) => tag.name);
  const scores = Object.fromEntries(
    Object.entries(entry).filter(([key]) => /score|affin|relev|weight|rank/i.test(key)),
  );
  console.log(
    `- ${entry.name} | ward=${geocode.city ?? '?'} | hood=${geocode.name ?? '?'} | ${JSON.stringify(scores)} | ${tags.join(', ')}`,
  );
}
