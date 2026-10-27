import type { QlooPort } from '../qloo/port';
import { allInterestTags, MATCH_TERM } from '../qloo/tags';

/**
 * What a city actually has, measured rather than guessed.
 *
 * One call: every interest resolves to a Qloo tag, and a single `insights`
 * request asks for places matching any of them in this city. `--filter-tags` is
 * an OR (verified: coffee + middle-eastern returned twelve coffee shops while
 * middle-eastern alone returned one), and it works without a taste signal.
 *
 * The count per interest is how many of the sampled places carry that tag. Zero
 * means nothing here; missing means we could not measure it.
 */
export interface CityProbe {
  city: string;
  sampled: number;
  supply: Record<string, number>;
  measured: string[];
  measuredAt: number;
}

/**
 * The insights endpoint rejects `--take` above ~55 with a 400, so 50 is the
 * widest sample that is safe. Verified: 50 works, 60 returns `400 Bad Request`.
 */
const TAKE = 50;
const TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; value: CityProbe }>();
const inflight = new Map<string, Promise<CityProbe | null>>();

export async function probeCity(city: string, port: QlooPort): Promise<CityProbe | null> {
  const key = city.trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = run(city, port)
    .then((value) => {
      if (value) cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}

async function run(city: string, port: QlooPort): Promise<CityProbe | null> {
  if (port.mode !== 'live') return null;

  const tags = await allInterestTags(port);
  if (tags.size === 0) return null;

  const ids = [...tags.values()].map((tag) => tag.id);
  const response = await port.insights({ location: city, take: TAKE, filterTags: ids });

  if (response.status === 'error') return null;

  const supply: Record<string, number> = {};
  const measured: string[] = [];

  /**
   * Place tags rarely equal the tag name exactly — a jazz bar is tagged
   * "Jazz music", not "Jazz". Match whole words, and fall back to a substring
   * only for needles long enough to be unambiguous.
   */
  const carries = (placeTags: string[], needle: string): boolean => {
    if (!needle) return false;
    return placeTags.some((raw) => {
      const tag = raw.trim().toLowerCase();
      if (tag === needle) return true;
      if (tag.split(/[^a-z0-9]+/).includes(needle)) return true;
      // Short words like "art" must not substring-match ("apartment").
      return needle.length >= 4 && tag.includes(needle);
    });
  };

  for (const interest of tags.keys()) {
    const needle = MATCH_TERM[interest];
    if (!needle) continue;
    measured.push(interest);
    supply[interest] = response.results.filter((place) => carries(place.tags, needle)).length;
  }

  return { city, sampled: response.results.length, supply, measured, measuredAt: Date.now() };
}

export function probeCacheStats(): { cities: number } {
  return { cities: cache.size };
}
