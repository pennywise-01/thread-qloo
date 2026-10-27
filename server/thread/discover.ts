import type { Budget, Interest } from '../../shared/thread';
import type { QlooPlace, QlooPort } from '../qloo/port';

/**
 * Which Qloo signal stands in for each interest.
 *
 * Qloo's graph works best from an entity: "people who love Miles Davis go to
 * these places". Abstract nouns ("vinyl") retrieve badly, so each cultural
 * interest is anchored to a specific, famous entity. Food and drink are the
 * exception — those are category filters, not taste signals.
 */
const ENTITY_SIGNALS: Partial<Record<Interest, string>> = {
  jazz: 'Miles Davis',
  techno: 'Aphex Twin',
  art: 'Yayoi Kusama',
  vinyl: 'Blue Note Records',
};

/**
 * Most interests are better served by a category tag than by an artist.
 *
 * An entity signal answers "what else do this artist's fans like", which is
 * powerful for jazz and records and useless for books: "Haruki Murakami" returns
 * churches, museums and viewpoints, not bookshops. The tag filter asks the
 * narrower, correct question.
 */
const CATEGORY_SIGNALS: Partial<Record<Interest, string>> = {
  'indie-rock': 'live music venue',
  books: 'bookstore',
  film: 'cinema',
  vintage: 'vintage clothing',
  design: 'design',
  coffee: 'coffee shop',
  ramen: 'ramen',
  wine: 'wine bar',
};

/**
 * Prefer a place-category tag over a product or setting tag.
 *
 * `find_tags "coffee shop"` returns eight tags in this order: cuisine, setting,
 * category:place, genre:place, amenity… The first two are useless as place
 * filters (`specialty_coffee` returned literally zero places in Lisbon), while
 * `urn:tag:category:place:coffee_shop` is exactly what we mean.
 */
function pickPlaceTag(results: { id: string; name: string }[]): { id: string; name: string } | undefined {
  return (
    results.find((tag) => /^urn:tag:(category|genre):place/.test(tag.id)) ??
    results.find((tag) => /^urn:tag:amenity:/.test(tag.id)) ??
    results[0]
  );
}

/**
 * What a place has to look like to count as this interest.
 *
 * Entity signals are strong but imprecise: "Haruki Murakami" pulls in churches,
 * museums and viewpoints because the graph relates his audience to cultural
 * landmarks generally. Every interest therefore gets a relevance test against
 * the place's own name, tags and description — not just the category ones.
 */
const RELEVANCE: Record<Interest, RegExp> = {
  'indie-rock': /live music|music venue|concert|indie|gig/i,
  jazz: /jazz|live music|music venue|blues/i,
  techno: /techno|club|electronic|dance|rave/i,
  vinyl: /record|vinyl|music/i,
  vintage: /vintage|second.?hand|thrift|clothing|fashion/i,
  art: /gallery|museum|art\b/i,
  books: /book|librar|livraria|literature/i,
  ramen: /ramen|noodle/i,
  wine: /wine|bar\b/i,
  film: /cinema|film|movie|theat/i,
  design: /design|furniture|interior|concept/i,
  coffee: /coffee|caf[eé]/i,
};

/**
 * Things Qloo's place graph knows about that are not a night out.
 *
 * The graph is Google-Places-derived, so hotels, lodges and transit hubs are
 * well tagged and surface in almost any category query.
 */
const NOT_A_VENUE = /hotel|lodging|hostel|lodge|guesthouse|guest house|apartment|airport|station|terminal/i;

/**
 * Keep only places that plausibly serve the interest.
 *
 * No fallback to the unfiltered list: when the signal produced churches instead
 * of bookshops, the honest answer is that this interest contributed nothing.
 * Falling back would quietly reintroduce exactly the noise this removes.
 */
function relevant(places: QlooPlace[], interest: Interest): QlooPlace[] {
  const pattern = RELEVANCE[interest];
  return places.filter((place) => {
    // Name and category only. Descriptions are marketing copy: Fnac's says it
    // sells books, which is true and does not make it a bookshop.
    const label = `${place.name} ${place.primaryGenre}`;
    if (NOT_A_VENUE.test(label)) return false;
    return pattern ? pattern.test(label) : true;
  });
}

export interface DiscoveredPlace {
  place: QlooPlace;
  hits: number;
  score: number;
  interests: Interest[];
}

export interface DiscoveryResult {
  places: DiscoveredPlace[];
  calls: number;
  signals: string[];
  /** How many places were dropped for having no price data at all. */
  unpriced: number;
}

/** price_level arrives on a 1-4 scale; the product uses 1-3. */
export function priceBucket(level: number | null): 1 | 2 | 3 {
  if (level === null) return 2;
  if (level <= 1) return 1;
  if (level >= 4) return 3;
  return Math.min(3, Math.max(1, Math.ceil(level * 0.75))) as 1 | 2 | 3;
}

/**
 * Budget filtering, with a rule about missing data.
 *
 * Most places in a city like Lagos have no `price_level` at all. Treating those
 * as mid-range would silently delete them the moment the user picks "Budget".
 * Unknown price is therefore always allowed, and the count is reported so the
 * omission is visible rather than quiet.
 */
export function priceAllowed(level: number | null, budget: Budget): boolean {
  if (budget === 3) return true;
  if (level === null) return true;
  return priceBucket(level) <= budget;
}

export async function discoverPlaces(
  interests: Interest[],
  budget: Budget,
  city: string,
  port: QlooPort,
): Promise<DiscoveryResult> {
  const entityInterests = interests.filter((interest) => ENTITY_SIGNALS[interest]);
  const categoryInterests = interests.filter((interest) => CATEGORY_SIGNALS[interest]);

  // Resolve every entity and tag lookup in parallel. Each is a separate CLI
  // process, so serialising them is what makes the first plan slow.
  const [entityResults, tagResults] = await Promise.all([
    Promise.all(
      entityInterests.map(async (interest) => ({
        interest,
        response: await port.searchEntities(ENTITY_SIGNALS[interest]!, 1),
      })),
    ),
    Promise.all(
      categoryInterests.map(async (interest) => ({
        interest,
        response: await port.findTags(CATEGORY_SIGNALS[interest]!, 8),
      })),
    ),
  ]);

  const entityIds: string[] = [];
  const signals: string[] = [];
  const resolvedEntities: { interest: Interest; id: string }[] = [];

  for (const entry of entityResults) {
    const hit = entry.response.results[0];
    if (hit) {
      entityIds.push(hit.id);
      signals.push(hit.name);
      resolvedEntities.push({ interest: entry.interest, id: hit.id });
    }
  }

  const merged = new Map<string, { place: QlooPlace; weight: number; interests: Set<Interest> }>();

  const absorb = (places: QlooPlace[], interest: Interest | null, take: number) => {
    places.forEach((place, index) => {
      const weight = (take - index) / take;
      const existing = merged.get(place.id);
      if (existing) {
        existing.weight += weight;
        if (interest) existing.interests.add(interest);
      } else {
        merged.set(place.id, { place, weight, interests: new Set(interest ? [interest] : []) });
      }
    });
  };

  let calls = 0;
  const tasks: Promise<void>[] = [];

  /**
   * One call per interest, not one merged call.
   *
   * A single call from every signal at once returns good places but loses which
   * interest produced them, and "how many of your interests this covers" is the
   * number the whole UI is built on. The calls run in parallel, so the cost is
   * wall-clock-neutral.
   */
  for (const entity of resolvedEntities) {
    tasks.push(
      port
        .insights({ location: city, take: 18, signalEntities: [entity.id] })
        .then((response) => {
          calls += 1;
          absorb(relevant(response.results, entity.interest), entity.interest, 18);
        }),
    );
  }

  for (const entry of tagResults) {
    const tag = pickPlaceTag(entry.response.results);
    if (!tag) continue;
    tasks.push(
      port
        .insights({
          location: city,
          take: 15,
          filterTags: [tag.id],
          signalEntities: entityIds.length > 0 ? entityIds : undefined,
        })
        .then((response) => {
          calls += 1;
          absorb(relevant(response.results, entry.interest), entry.interest, 15);
        }),
    );
  }

  await Promise.all(tasks);

  let unpriced = 0;
  const affordable = [...merged.values()].filter((entry) => {
    const haystack = `${entry.place.name} ${entry.place.tags.join(' ')}`;
    if (NOT_A_VENUE.test(haystack)) return false;
    if (entry.place.priceLevel === null) {
      unpriced += 1;
      return priceAllowed(null, budget);
    }
    return priceAllowed(entry.place.priceLevel, budget);
  });

  const maxWeight = Math.max(0.0001, ...affordable.map((entry) => entry.weight));

  const places: DiscoveredPlace[] = affordable
    .map((entry) => ({
      place: entry.place,
      hits: entry.interests.size,
      score: Math.max(1, Math.round((entry.weight / maxWeight) * 1000) / 10),
      interests: [...entry.interests],
    }))
    .sort((a, b) => b.score - a.score);

  return { places, calls, signals, unpriced };
}
