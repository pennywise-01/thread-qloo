import {
  DISTRICTS as MOCK_DISTRICTS,
  VENUES,
  WINDOWS,
  type Budget,
  type DayPlan,
  type District,
  type DistrictId,
  type Interest,
  type MatchedStop,
  type SkippedVenue,
  type ThreadRequest,
  type ThreadResult,
  type Venue,
  type Window,
} from '../../shared/thread';
import { resolveCity } from '../../shared/cities';
import type { QlooPlace, QlooPort } from '../qloo/port';
import { discoverPlaces, priceBucket, type DiscoveredPlace } from './discover';

const MAX_STOPS_PER_DAY = 3;
const MAX_DAYS = 30;
const RECENT_DISTRICT_PENALTY = 30;
const REPEATED_KIND_PENALTY = 8;

export class ThreadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ThreadError';
  }
}

const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Between stops: walking inside a neighbourhood, transit across one.
 *
 * Live mode returns real coordinates, and a Tokyo ward can be eight kilometres
 * wide, so a straight-line "walk" of 58 minutes is a lie. Anything past 1.2 km
 * is reported as transit.
 */
const travel = (a: Venue, b: Venue): { minutes: number; mode: 'walk' | 'transit' } => {
  if (!a.lat || !b.lat) return { minutes: 8, mode: 'walk' };
  const km = haversineKm(a, b);
  if (km <= 1.2) return { minutes: Math.max(3, Math.round((km / 4.5) * 60) + 2), mode: 'walk' };
  return { minutes: Math.max(8, Math.round((km / 18) * 60) + 6), mode: 'transit' };
};

interface Scored {
  venue: Venue;
  matched: Interest[];
  match: number;
}

interface Slot {
  window: Window;
  entry: Scored;
}

export async function planThread(request: ThreadRequest, port: QlooPort): Promise<ThreadResult> {
  const days = Number(request.days);
  const budget = Number(request.budget) as Budget;
  const interests = [...new Set(request.interests ?? [])];

  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new ThreadError(400, `Pick between 1 and ${MAX_DAYS} days.`);
  }
  if (!interests.length) {
    throw new ThreadError(400, 'Pick at least two things you like.');
  }
  if (![1, 2, 3].includes(budget)) {
    throw new ThreadError(400, 'Pick a budget.');
  }

  const resolved = resolveCity(request.city);
  if (!resolved.name) {
    throw new ThreadError(400, 'Pick a city.');
  }

  const live = port.mode === 'live';
  if (!live && resolved.name.toLowerCase() !== 'tokyo') {
    throw new ThreadError(
      422,
      `Live mode is required for ${resolved.name}. The offline catalog is Tokyo only — set QLOO_MODE=live.`,
    );
  }

  const candidates = live
    ? await buildLiveCandidates(interests, budget, resolved.name, port)
    : buildMockCandidates(interests, budget);

  if (candidates.matching.length === 0) {
    throw new ThreadError(
      422,
      `Nothing in ${resolved.name} matches those interests at this budget. Try another interest or a higher budget.`,
    );
  }

  const plan = buildDays(candidates.matching, interests, days, candidates.districts);

  const chosenIds = new Set(plan.flatMap((day) => day.stops.map((stop) => stop.venue.id)));
  const byId = new Map(candidates.matching.map((entry) => [entry.venue.id, entry] as const));
  const chosenDistrictIds = new Set(plan.map((day) => day.district.id));
  const skipped = buildSkipped(chosenIds, byId, chosenDistrictIds);

  return {
    mode: port.mode,
    city: resolved.name,
    days: plan.length,
    requestedDays: days,
    interests,
    budget,
    plan,
    skipped,
    considered: candidates.considered,
    candidates: candidates.candidates,
    signals: candidates.signals,
    calls: candidates.calls,
    unpriced: candidates.unpriced,
    notes: {
      data: live
        ? `Places and ranking from Qloo for ${resolved.name}. Coordinates from the same records.`
        : 'Ranked locally from the interest tags below. Qloo supplies these scores in live mode.',
      scope: 'Walking times are estimates between stops. Confirm opening hours before you go.',
    },
  };
}

interface CandidateSet {
  matching: Scored[];
  districts: District[];
  considered: number;
  candidates: number;
  signals: string[];
  calls: number;
  unpriced: number;
}

/**
 * Live: Qloo discovers real places from your signals, then we score them by how
 * many of your interests surfaced them and how highly they ranked.
 */
async function buildLiveCandidates(
  interests: Interest[],
  budget: Budget,
  city: string,
  port: QlooPort,
): Promise<CandidateSet> {
  const discovery = await discoverPlaces(interests, budget, city, port);
  const world = placesToWorld(discovery.places);

  const scored: Scored[] = world.venues.map((venue) => {
    const entry = discovery.places.find((candidate) => candidate.place.id === venue.id);
    return {
      venue,
      matched: entry?.interests ?? [],
      match: Math.max(1, entry?.score ?? 1),
    };
  });

  // Anchor logic assumes matching[0] is the best place in the city.
  const ordered = scored.sort((a, b) => b.match - a.match);

  // Qloo returns long tails. A 4% match is noise, not a recommendation, so drop
  // the tail unless that would leave too little to build a day from.
  const strong = ordered.filter((entry) => entry.match >= 20);

  return {
    matching: strong.length >= 6 ? strong : ordered,
    districts: world.districts,
    considered: discovery.places.length,
    candidates: world.venues.length,
    signals: discovery.signals,
    calls: discovery.calls,
    unpriced: discovery.unpriced,
  };
}

/** Mock: score the curated catalog from its interest tags. */
function buildMockCandidates(interests: Interest[], budget: Budget): CandidateSet {
  const affordable = VENUES.filter((venue) => venue.price <= budget);
  const weights = new Map<Interest, number>();

  for (const venue of affordable) {
    for (const interest of venue.interests) {
      weights.set(interest, (weights.get(interest) ?? 0) + 1);
    }
  }
  for (const [interest, count] of weights) weights.set(interest, 1 / Math.max(count, 1));

  const maxRarity = Math.max(0.0001, ...[...weights.values()]);

  const scored: Scored[] = affordable.map((venue) => {
    const matched = venue.interests.filter((interest) => interests.includes(interest));
    const coverage = matched.length / interests.length;
    const rarity =
      matched.reduce((sum, interest) => sum + (weights.get(interest) ?? 0), 0) /
      Math.max(1, matched.length) /
      maxRarity;
    return { venue, matched, match: Math.max(1, Math.round((coverage * 0.9 + rarity * 0.1) * 100)) };
  });

  return {
    matching: scored.filter((entry) => entry.matched.length > 0),
    districts: MOCK_DISTRICTS,
    considered: VENUES.length,
    candidates: affordable.length,
    signals: [],
    calls: 0,
    unpriced: 0,
  };
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tokyo';

const KIND_TAGS: [RegExp, string][] = [
  [/bar\b|cocktail|pub\b/i, 'bar'],
  [/restaurant|izakaya|diner|bistro/i, 'restaurant'],
  [/club|dance/i, 'club'],
  [/live music|music venue|live house/i, 'live music'],
  [/gallery|museum/i, 'gallery'],
  [/book/i, 'bookshop'],
  [/record/i, 'record shop'],
  [/caf[eé]|coffee/i, 'café'],
];

function kindOf(place: QlooPlace): string {
  // `primary_genre` is Qloo's own category and is far more reliable than the
  // loose tag list, which gives almost every place a dozen possible labels.
  for (const [pattern, kind] of KIND_TAGS) {
    if (pattern.test(place.primaryGenre)) return kind;
  }
  for (const [pattern, kind] of KIND_TAGS) {
    if (pattern.test(place.description)) return kind;
  }
  return 'place';
}

function windowsOf(place: QlooPlace): Window[] {
  const tags = place.tags.map((tag) => tag.toLowerCase());
  const windows: Window[] = [];

  if (tags.some((tag) => /^(morning|breakfast)$/.test(tag))) windows.push('morning');
  if (tags.some((tag) => /^(midday|afternoon|lunch)$/.test(tag))) windows.push('afternoon');
  if (tags.some((tag) => /^(evening|dinner|night|late night)$/.test(tag))) windows.push('evening');

  if (windows.length === 0) {
    const kind = kindOf(place);
    if (kind === 'café' || kind === 'bookshop') return ['morning', 'afternoon'];
    if (kind === 'bar' || kind === 'club' || kind === 'live music') return ['evening'];
    return ['afternoon', 'evening'];
  }
  return windows;
}

const CLUSTER_KM = 3;
const MERGE_KM = 7;

const toVenue = (place: QlooPlace, interests: Interest[]): Venue => ({
  id: place.id,
  name: place.name,
  district: slug(place.ward),
  kind: kindOf(place),
  interests,
  windows: windowsOf(place),
  price: priceBucket(place.priceLevel),
  lat: place.lat ?? 0,
  lon: place.lon ?? 0,
  note: place.description.slice(0, 180) || place.hood,
});

/**
 * Group real places into days you can actually walk.
 *
 * Wards are far too coarse — Setagaya is eight kilometres across — so a "day in
 * Setagaya" is not a day you can walk. Places are clustered greedily by
 * distance instead, taking the highest-scoring places first and naming each
 * cluster after the neighbourhood of its anchor.
 */
function placesToWorld(places: DiscoveredPlace[]): { venues: Venue[]; districts: District[] } {
  const clusters: { name: string; lat: number; lon: number; venues: Venue[] }[] = [];

  for (const { place, interests } of places) {
    const venue = toVenue(place, interests);
    if (!venue.lat || !venue.lon) continue;

    const target = clusters.find(
      (cluster) => haversineKm(cluster, { lat: venue.lat!, lon: venue.lon! }) <= CLUSTER_KM,
    );

    if (target) {
      target.venues.push(venue);
      target.lat =
        target.venues.reduce((sum, entry) => sum + entry.lat, 0) / target.venues.length;
      target.lon =
        target.venues.reduce((sum, entry) => sum + entry.lon, 0) / target.venues.length;
    } else {
      clusters.push({
        name: place.hood ? `${place.ward} · ${place.hood}` : place.ward,
        lat: venue.lat,
        lon: venue.lon,
        venues: [venue],
      });
    }
  }

  // A cluster with a single venue makes a one-stop day, which is not an
  // itinerary. Fold those into the nearest cluster that already has company.
  for (let index = clusters.length - 1; index >= 0; index -= 1) {
    const cluster = clusters[index]!;
    if (cluster.venues.length > 1) continue;

    let nearest: (typeof clusters)[number] | null = null;
    let nearestKm = MERGE_KM;
    for (const other of clusters) {
      if (other === cluster || other.venues.length < 2) continue;
      const distance = haversineKm(other, cluster);
      if (distance < nearestKm) {
        nearest = other;
        nearestKm = distance;
      }
    }
    if (!nearest) continue;

    nearest.venues.push(...cluster.venues);
    clusters.splice(index, 1);
  }

  const seen = new Map<string, number>();

  // A cluster with one venue is a single stop and, if it is far from everything
  // else, a day trip to nowhere. Keep only clusters that can carry a day.
  const dense = clusters.filter((cluster) => cluster.venues.length >= 2);
  const base = dense.length > 0 ? dense : clusters;

  // Drop clusters that sit far outside the rest of the city.
  //
  // The anchor is the densest cluster, not the median: `--filter-location`
  // covers the metro region, so a Lisbon search returns Belém, Cascais and
  // Cabo da Roca, and a median of those points is not the city.
  const anchor = base.reduce<(typeof base)[number] | undefined>(
    (best, cluster) => (!best || cluster.venues.length > best.venues.length ? cluster : best),
    undefined,
  );
  const near = anchor ? base.filter((cluster) => haversineKm(cluster, anchor) <= 12) : base;
  const kept = near.length > 0 ? near : base;

  const districts: District[] = kept.map((cluster) => {
    let id = slug(cluster.name);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;

    const kinds = [...new Set(cluster.venues.map((venue) => venue.kind))].slice(0, 3);

    return {
      id,
      name: cluster.name,
      lat: cluster.lat,
      lon: cluster.lon,
      character: `${cluster.venues.length} place${
        cluster.venues.length === 1 ? '' : 's'
      } within walking distance — ${kinds.join(', ')}.`,
    };
  });

  // Point each venue at its cluster, not its ward.
  const venues: Venue[] = kept.flatMap((cluster, index) =>
    cluster.venues.map((venue) => ({ ...venue, district: districts[index]!.id })),
  );

  return { venues, districts };
}

/**
 * Build the itinerary, one day at a time.
 *
 * Packing three stops into every day exhausts a small pool early, so this tries
 * dense first and only thins the days out if the requested number cannot
 * otherwise be filled. A two-week request should not quietly become ten days.
 */
function buildDays(
  matching: Scored[],
  interests: Interest[],
  days: number,
  districts: District[],
): DayPlan[] {
  let best: DayPlan[] = [];

  for (let limit = MAX_STOPS_PER_DAY; limit >= 1; limit -= 1) {
    const plan = buildDaysWithLimit(matching, interests, days, limit, districts);
    if (plan.length > best.length) best = plan;
    if (plan.length >= days) return plan;
  }

  return best;
}

function buildDaysWithLimit(
  matching: Scored[],
  interests: Interest[],
  days: number,
  perDay: number,
  districts: District[],
): DayPlan[] {
  const plan: DayPlan[] = [];
  const usedVenues = new Set<string>();
  const usedKinds = new Set<string>();
  const recentDistricts: DistrictId[] = [];

  const pushDay = (districtId: DistrictId, slots: Slot[]) => {
    const district = districts.find((entry) => entry.id === districtId);
    if (!district || slots.length === 0) return;

    const stops: MatchedStop[] = [];
    for (const slot of slots) {
      const previous = stops[stops.length - 1];
      const leg = previous ? travel(previous.venue, slot.entry.venue) : null;
      stops.push({
        venue: slot.entry.venue,
        window: slot.window,
        hits: slot.entry.matched.length,
        match: slot.entry.match,
        travelMinutes: leg?.minutes ?? null,
        travelMode: leg?.mode ?? null,
        reason: describeMatch(slot.entry, stops.length),
      });
      usedVenues.add(slot.entry.venue.id);
      usedKinds.add(slot.entry.venue.kind);
    }

    plan.push({
      index: plan.length + 1,
      district,
      stops,
      summary: summariseDay(stops.map((stop) => stop.venue)),
    });
    recentDistricts.push(districtId);
  };

  // Anchors must not consume every day, or the itinerary becomes one stop per
  // day and the greedy fill never runs.
  const anchorBudget = Math.max(1, days - 1);
  for (const anchor of anchorDays(matching, interests, anchorBudget)) {
    pushDay(
      anchor.districtId,
      assignWindows(available(matching, anchor.districtId, usedVenues), anchor.venueId, perDay),
    );
  }

  while (plan.length < days) {
    let best: { districtId: DistrictId; slots: Slot[]; adjusted: number } | null = null;

    for (const district of districts) {
      const entries = available(matching, district.id, usedVenues);
      if (entries.length === 0) continue;

      const slots = assignWindows(entries, undefined, perDay);
      if (slots.length === 0) continue;

      const quality = slots.reduce((sum, slot) => sum + slot.entry.match, 0) + slots.length * 3;
      const recent = recentDistricts.slice(-2).includes(district.id) ? RECENT_DISTRICT_PENALTY : 0;
      const repeated = slots.filter((slot) => usedKinds.has(slot.entry.venue.kind)).length;
      const adjusted = quality - recent - repeated * REPEATED_KIND_PENALTY;

      if (!best || adjusted > best.adjusted) best = { districtId: district.id, slots, adjusted };
    }

    if (!best) break;
    pushDay(best.districtId, best.slots);
  }

  return plan;
}

const available = (matching: Scored[], districtId: DistrictId, usedVenues: Set<string>): Scored[] =>
  matching.filter((entry) => entry.venue.district === districtId && !usedVenues.has(entry.venue.id));

/**
 * One day per district that *leads* with an interest you picked.
 *
 * A venue counts as covering an interest only if that interest is its primary
 * one, so a techno club that also tags jazz is not an answer to "I came for
 * jazz".
 */
function anchorDays(
  matching: Scored[],
  interests: Interest[],
  limit: number,
): { districtId: DistrictId; venueId: string; match: number }[] {
  const byDistrict = new Map<DistrictId, { districtId: DistrictId; venueId: string; match: number }>();

  // The single best place in the city always anchors a day. Letting the
  // district math drop a 100% match because its neighbourhood scored badly is
  // the one failure a user would never forgive.
  const best = matching[0];
  if (best) {
    byDistrict.set(best.venue.district, {
      districtId: best.venue.district,
      venueId: best.venue.id,
      match: best.match,
    });
  }

  for (const interest of interests) {
    const candidate = matching
      .filter((entry) => entry.venue.interests[0] === interest)
      .sort((a, b) => b.match - a.match)[0];
    if (!candidate) continue;

    const existing = byDistrict.get(candidate.venue.district);
    if (!existing || candidate.match > existing.match) {
      byDistrict.set(candidate.venue.district, {
        districtId: candidate.venue.district,
        venueId: candidate.venue.id,
        match: candidate.match,
      });
    }
  }

  return [...byDistrict.values()].sort((a, b) => b.match - a.match).slice(0, limit);
}

/**
 * Assign venues to time windows to maximise the day.
 *
 * Greedy assignment gets this wrong: if the best shop takes the afternoon, a
 * worse shop that also only opens in the afternoon is locked out, when moving
 * the first one to the evening would have fitted both.
 */
function assignWindows(entries: Scored[], anchorId?: string, maxStops = MAX_STOPS_PER_DAY): Slot[] {
  const assignment: (Scored | null)[] = WINDOWS.map(() => null);
  let best: (Scored | null)[] = [];
  let bestScore = -1;

  const anchor = anchorId ? entries.find((entry) => entry.venue.id === anchorId) : undefined;
  if (anchor) {
    const window = WINDOWS.find((candidate) => anchor.venue.windows.includes(candidate));
    if (window) assignment[WINDOWS.indexOf(window)] = anchor;
  }

  const recurse = (windowIndex: number) => {
    if (windowIndex === WINDOWS.length) {
      const picked = assignment.filter((entry): entry is Scored => entry !== null);
      const score = picked.reduce((sum, entry) => sum + entry.match, 0) + picked.length * 3;
      if (score > bestScore) {
        bestScore = score;
        best = [...assignment];
      }
      return;
    }

    if (assignment[windowIndex] !== null) {
      recurse(windowIndex + 1);
      return;
    }

    recurse(windowIndex + 1);

    const used = new Set(
      assignment.filter((entry): entry is Scored => entry !== null).map((entry) => entry.venue.id),
    );
    for (const entry of entries) {
      if (used.has(entry.venue.id)) continue;
      if (!entry.venue.windows.includes(WINDOWS[windowIndex]!)) continue;
      assignment[windowIndex] = entry;
      recurse(windowIndex + 1);
      assignment[windowIndex] = null;
    }
  };

  recurse(0);

  return best
    .map((entry, index) => (entry ? { window: WINDOWS[index]!, entry } : null))
    .filter((slot): slot is Slot => slot !== null)
    .slice(0, maxStops);
}

function describeMatch(entry: Scored, stopIndex: number): string {
  const names = entry.matched.slice(0, 2).join(' + ');
  if (!names) return 'Pulled from your signals.';
  if (stopIndex === 0) return `Opens the day on ${names}.`;
  return `Matches ${names}.`;
}

function summariseDay(venues: Venue[]): string {
  const kinds = [...new Set(venues.map((venue) => venue.kind))];
  if (kinds.length === 0) return '';
  if (kinds.length === 1) return kinds[0]!;
  return `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
}

function buildSkipped(
  chosenIds: Set<string>,
  byId: Map<string, Scored>,
  chosenDistrictIds: Set<string>,
): SkippedVenue[] {
  const out: SkippedVenue[] = [];

  const unchosen = [...byId.values()]
    .filter((entry) => !chosenIds.has(entry.venue.id))
    .sort((a, b) => b.match - a.match)
    .slice(0, 5);

  for (const entry of unchosen) {
    // Nothing in `matching` is over budget by construction — it was filtered
    // before we got here — so the only honest reasons left are geography and
    // competition for the slot.
    const reason = !chosenDistrictIds.has(entry.venue.district)
      ? `in ${entry.venue.district.replace(/-/g, ' ')}, which is not on your route`
      : 'this slot went to a better fit';

    out.push({ venue: entry.venue, hits: entry.matched.length, match: entry.match, reason });
  }

  return out;
}
