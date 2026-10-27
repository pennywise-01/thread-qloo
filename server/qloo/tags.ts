import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Interest } from '../../shared/thread';
import type { QlooPort } from './port';
import bundledTags from './interest-tags.json';

/**
 * The query term used to resolve each interest to a Qloo tag.
 *
 * These are deliberately concrete nouns. `find_tags` is semantic, but "vinyl"
 * returns genres while "record store" returns the place category we want.
 */
const QUERY: Record<Interest, string> = {
  'indie-rock': 'indie rock',
  jazz: 'jazz',
  techno: 'techno',
  coffee: 'specialty coffee',
  vinyl: 'record store',
  vintage: 'vintage clothing',
  art: 'art gallery',
  books: 'bookstore',
  ramen: 'ramen',
  wine: 'natural wine',
  film: 'cinema',
  design: 'design',
};

export interface InterestTag {
  id: string;
  name: string;
}

/**
 * The word to look for in a place's own tags.
 *
 * `find_tags` returns product-shaped names ("Specialty Coffee", "Vintage
 * Clothing") while places are tagged more plainly ("Coffee", "Vintage"). The
 * probe matches on these, not on the resolved tag name.
 */
export const MATCH_TERM: Record<Interest, string> = {
  'indie-rock': 'indie',
  jazz: 'jazz',
  techno: 'techno',
  coffee: 'coffee',
  vinyl: 'record store',
  vintage: 'vintage',
  art: 'gallery',
  books: 'book',
  ramen: 'ramen',
  wine: 'wine',
  film: 'cinema',
  design: 'design',
};

const CACHE_DIR = '.cache';
const CACHE_FILE = path.join(CACHE_DIR, 'interest-tags.json');

const memory = new Map<Interest, InterestTag | null>();
let hydrated: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return hydrated;
  hydrated = (async () => {
    // Shipped alongside the code: resolving twelve tags at runtime costs ~35s on
    // a 2-vCPU VM, and the answer never changes. Refresh only fills gaps.
    for (const [interest, tag] of Object.entries(bundledTags)) {
      if (!memory.has(interest as Interest)) memory.set(interest as Interest, tag as InterestTag | null);
    }
    try {
      const raw = await readFile(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, InterestTag | null>;
      for (const [interest, tag] of Object.entries(parsed)) {
        if (!memory.has(interest as Interest)) memory.set(interest as Interest, tag);
      }
    } catch {
      // No runtime cache; the bundled map is enough.
    }
  })();
  return hydrated;
}

async function persist(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(memory), null, 2), 'utf8');
  } catch {
    // A read-only filesystem should not break the probe.
  }
}

/** Resolve one interest to a Qloo tag URN, cached in memory and on disk. */
export async function interestTag(
  interest: Interest,
  port: QlooPort,
): Promise<InterestTag | null> {
  await hydrate();
  if (memory.has(interest)) return memory.get(interest) ?? null;

  const response = await port.findTags(QUERY[interest], 5);
  const hit = response.results.find((tag) => tag.id.startsWith('urn:tag:')) ?? null;

  const value: InterestTag | null = hit ? { id: hit.id, name: hit.name } : null;
  memory.set(interest, value);
  await persist();
  return value;
}

/** Resolve every interest once. Parallel; each lookup is a separate CLI call. */
export async function allInterestTags(port: QlooPort): Promise<Map<Interest, InterestTag>> {
  await hydrate();
  const interests = Object.keys(QUERY) as Interest[];

  await Promise.all(
    interests.filter((interest) => !memory.has(interest)).map((interest) => interestTag(interest, port)),
  );

  const resolved = new Map<Interest, InterestTag>();
  for (const interest of interests) {
    const tag = memory.get(interest);
    if (tag) resolved.set(interest, tag);
  }
  return resolved;
}

export { QUERY as INTEREST_QUERY };
