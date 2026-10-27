export type Interest =
  | 'indie-rock'
  | 'jazz'
  | 'techno'
  | 'coffee'
  | 'vinyl'
  | 'vintage'
  | 'art'
  | 'books'
  | 'ramen'
  | 'wine'
  | 'film'
  | 'design';

export const INTERESTS: { id: Interest; label: string; hint: string }[] = [
  { id: 'indie-rock', label: 'Indie rock', hint: 'live houses, small rooms' },
  { id: 'jazz', label: 'Jazz', hint: 'listening bars, late sets' },
  { id: 'techno', label: 'Techno', hint: 'clubs, warehouse floors' },
  { id: 'coffee', label: 'Specialty coffee', hint: 'roasters, pour-over' },
  { id: 'vinyl', label: 'Vinyl', hint: 'record shops, crates' },
  { id: 'vintage', label: 'Vintage fashion', hint: 'second-hand, archive' },
  { id: 'art', label: 'Contemporary art', hint: 'galleries, museums' },
  { id: 'books', label: 'Books', hint: 'bookshops, reading rooms' },
  { id: 'ramen', label: 'Ramen', hint: 'counters, late bowls' },
  { id: 'wine', label: 'Natural wine', hint: 'bars, small plates' },
  { id: 'film', label: 'Film', hint: 'repertory, arthouse' },
  { id: 'design', label: 'Design', hint: 'furniture, objects, architecture' },
];

/**
 * A district is a neighbourhood in mock mode and a ward in live mode, so this
 * is a plain string rather than a fixed union.
 */
export type DistrictId = string;

export type Window = 'morning' | 'afternoon' | 'evening';

export const WINDOWS: Window[] = ['morning', 'afternoon', 'evening'];

export interface District {
  id: DistrictId;
  name: string;
  lat: number;
  lon: number;
  character: string;
}

export const DISTRICTS: District[] = [
  { id: 'shimokitazawa', name: 'Shimokitazawa', lat: 35.6614, lon: 139.668, character: 'Little bars, live houses, and the deepest used-record basements in the city.' },
  { id: 'koenji', name: 'Koenji', lat: 35.705, lon: 139.6497, character: 'Punk, cheap beer, and second-hand everything. Tokyo’s least polished neighbourhood.' },
  { id: 'nakameguro', name: 'Nakameguro', lat: 35.6437, lon: 139.6982, character: 'Canal-side coffee and wine. Slow mornings that turn into long evenings.' },
  { id: 'daikanyama', name: 'Daikanyama', lat: 35.6485, lon: 139.699, character: 'Bookshops, design objects, and a quieter kind of money.' },
  { id: 'shibuya', name: 'Shibuya', lat: 35.6595, lon: 139.7005, character: 'Records by the floor, clubs above them, and no quiet anywhere.' },
  { id: 'shinjuku', name: 'Shinjuku', lat: 35.6938, lon: 139.7034, character: 'Jazz basements, late counters, and the city still awake at four.' },
  { id: 'kichijoji', name: 'Kichijoji', lat: 35.703, lon: 139.5797, character: 'Park, records, and a live circuit that never got famous.' },
  { id: 'ebisu', name: 'Ebisu', lat: 35.6467, lon: 139.71, character: 'Small bars stacked vertically, and a venue under the tracks.' },
];

export interface Venue {
  id: string;
  name: string;
  district: DistrictId;
  kind: string;
  interests: Interest[];
  windows: Window[];
  price: 1 | 2 | 3;
  lat: number;
  lon: number;
  note: string;
  /** On every list already. Used for the "what we skipped" panel. */
  iconic?: boolean;
}

const v = (
  id: string,
  name: string,
  district: DistrictId,
  kind: string,
  interests: Interest[],
  windows: Window[],
  price: 1 | 2 | 3,
  lat: number,
  lon: number,
  note: string,
  iconic = false,
): Venue => ({ id, name, district, kind, interests, windows, price, lat, lon, note, iconic });

export const VENUES: Venue[] = [
  // Shimokitazawa
  v('du-shimokita', 'Disk Union Shimokitazawa', 'shimokitazawa', 'record shop', ['vinyl', 'indie-rock'], ['afternoon'], 2, 35.6618, 139.6673, 'Six floors, separated by genre. The indie basement is the one.'),
  v('flash-disc', 'Flash Disc Ranch', 'shimokitazawa', 'record shop', ['vinyl', 'indie-rock'], ['afternoon'], 2, 35.6625, 139.6661, 'Crates stacked to the ceiling, priced by hand.'),
  v('shelter', 'Shelter', 'shimokitazawa', 'live house', ['indie-rock', 'techno'], ['evening'], 2, 35.6608, 139.6677, 'Basement room under the tracks; touring bands and local openers.'),
  v('bear-pond', 'Bear Pond Espresso', 'shimokitazawa', 'coffee', ['coffee', 'design'], ['morning'], 2, 35.6629, 139.6652, 'Two seats of standing room and an espresso taken very seriously.'),
  v('ny-joe', 'New York Joe Exchange', 'shimokitazawa', 'vintage', ['vintage'], ['afternoon'], 1, 35.6604, 139.6688, 'Bins, not rails. Everything under a few thousand yen.'),
  v('village-vanguard', 'Village Vanguard', 'shimokitazawa', 'bookshop', ['books', 'design'], ['afternoon', 'evening'], 1, 35.6612, 139.6668, 'Books, records, and things you did not know you wanted.'),
  v('flamingo', 'Flamingo', 'shimokitazawa', 'vintage', ['vintage', 'design'], ['afternoon'], 2, 35.6631, 139.6672, 'Americana and workwear, sorted by decade.'),

  // Koenji
  v('enban', 'Enban', 'koenji', 'record shop', ['vinyl', 'indie-rock'], ['afternoon'], 2, 35.7056, 139.6491, 'A small room with strong opinions. Ask what just came in.'),
  v('20000v', '20000V', 'koenji', 'live house', ['indie-rock', 'techno'], ['evening'], 1, 35.7042, 139.6504, 'Noise, punk, and bills that would not survive anywhere else.'),
  v('du-koenji', 'Disk Union Koenji', 'koenji', 'record shop', ['vinyl'], ['afternoon'], 2, 35.7048, 139.6481, 'Deeper jazz and experimental than the bigger branches.'),
  v('junjo', 'Junjo Shotengai', 'koenji', 'vintage strip', ['vintage', 'books'], ['afternoon'], 1, 35.7051, 139.6512, 'A covered street of second-hand shops and standing bars.'),
  v('koenji-bar', 'Koenji Small Bar Row', 'koenji', 'bars', ['wine', 'jazz'], ['evening'], 1, 35.7045, 139.6495, 'Six bars up one staircase, each the size of a kitchen.'),
  v('hako', 'Hako', 'koenji', 'gallery / zines', ['art', 'books'], ['afternoon'], 1, 35.7053, 139.6501, 'Zines, prints, and small shows by whoever is around.'),

  // Nakameguro
  v('onibus', 'Onibus Coffee', 'nakameguro', 'coffee', ['coffee', 'design'], ['morning'], 2, 35.6431, 139.6989, 'Roastery under the train line. Sit outside and watch it go past.'),
  v('roastery', 'Starbucks Reserve Roastery', 'nakameguro', 'coffee', ['coffee', 'design'], ['morning'], 3, 35.6423, 139.6992, 'Four floors of theatre. Worth it once, early, before the queue.'),
  v('koukashita', 'Nakameguro Koukashita', 'nakameguro', 'shops under the tracks', ['design', 'vintage', 'books'], ['afternoon'], 2, 35.644, 139.6985, 'A row of small, well-chosen shops in the viaduct arches.'),
  v('canal-wine', 'Canal Wine Bar', 'nakameguro', 'wine bar', ['wine', 'design'], ['evening'], 2, 35.6443, 139.6979, 'Canal-side counter, bottles opened by the glass.'),
  v('meguro-river', 'Meguro River Walk', 'nakameguro', 'walk', ['design', 'coffee'], ['morning', 'afternoon'], 1, 35.6435, 139.6996, 'The walk is the point. Start at one end and let it set the pace.'),

  // Daikanyama
  v('t-site', 'Daikanyama T-Site', 'daikanyama', 'bookshop', ['books', 'design', 'coffee'], ['morning', 'afternoon'], 2, 35.6489, 139.6996, 'Three connected buildings of books, magazines, and a good café.'),
  v('unit', 'Unit', 'daikanyama', 'live house', ['techno', 'jazz'], ['evening'], 2, 35.6479, 139.6986, 'Low ceiling, serious sound system, mostly electronic and experimental bills.'),
  v('ragtag', 'Ragtag', 'daikanyama', 'vintage', ['vintage', 'design'], ['afternoon'], 2, 35.6492, 139.7002, 'Archive designer, arranged by decade, priced accordingly.'),
  v('daikanyama-cafe', 'Daikanyama Backstreet Café', 'daikanyama', 'café', ['coffee', 'books'], ['morning'], 2, 35.6482, 139.7007, 'Quiet, wooden, and slow in a way the rest of the city is not.'),

  // Shibuya
  v('tower', 'Tower Records Shibuya', 'shibuya', 'record shop', ['vinyl', 'indie-rock', 'jazz'], ['afternoon', 'evening'], 2, 35.6598, 139.6996, 'The whole building. Start at the top and work down.', true),
  v('du-shibuya', 'Disk Union Shibuya', 'shibuya', 'record shop', ['vinyl', 'jazz', 'techno'], ['afternoon'], 2, 35.6605, 139.7002, 'The jazz and club floors are the reason to come.'),
  v('womb', 'Womb', 'shibuya', 'club', ['techno'], ['evening'], 3, 35.6591, 139.6986, 'Four floors, main room built for a long night.'),
  v('shibuya-art', 'Shibuya Gallery Floor', 'shibuya', 'gallery', ['art', 'design'], ['afternoon'], 2, 35.6606, 139.7011, 'Small commercial galleries stacked in one building.'),
  v('shibuya-ramen', 'Shibuya Ramen Counter', 'shibuya', 'ramen', ['ramen'], ['evening'], 1, 35.6594, 139.7015, 'Eight seats, one bowl, no conversation.'),

  // Shinjuku
  v('pit-inn', 'Pit Inn', 'shinjuku', 'jazz club', ['jazz'], ['evening'], 2, 35.6928, 139.7045, 'Basement jazz since 1965. Two sets a night, no talking through them.'),
  v('du-shinjuku', 'Disk Union Shinjuku', 'shinjuku', 'record shop', ['vinyl', 'jazz'], ['afternoon'], 2, 35.6936, 139.7032, 'The jazz floor is the one people cross town for.'),
  v('kinokuniya', 'Kinokuniya Shinjuku', 'shinjuku', 'bookshop', ['books', 'design'], ['afternoon', 'evening'], 2, 35.6941, 139.7015, 'Seven floors, and a foreign-language section worth the trip.', true),
  v('omoide', 'Omoide Yokocho', 'shinjuku', 'alleys', ['ramen', 'wine'], ['evening'], 1, 35.693, 139.6994, 'Tiny counters under the tracks. Loud, cramped, excellent.'),
  v('shinjuku-cinema', 'Shinjuku Repertory Cinema', 'shinjuku', 'cinema', ['film', 'art'], ['evening'], 2, 35.6922, 139.7051, 'Repertory programming and a very committed audience.'),

  // Kichijoji
  v('du-kichijoji', 'Disk Union Kichijoji', 'kichijoji', 'record shop', ['vinyl', 'indie-rock'], ['afternoon'], 2, 35.7035, 139.5802, 'Smaller, calmer, and often better picked than the city branches.'),
  v('star-pines', 'Star Pine’s Cafe', 'kichijoji', 'live house', ['jazz', 'indie-rock'], ['evening'], 2, 35.7022, 139.5791, 'Seated room, good piano, a programme that mixes both.'),
  v('inokashira', 'Inokashira Park', 'kichijoji', 'park', ['design', 'art'], ['morning', 'afternoon'], 1, 35.7004, 139.5738, 'Rent a rowboat, or just walk the loop.'),
  v('kichijoji-coffee', 'Kichijoji Kissaten', 'kichijoji', 'kissaten', ['coffee', 'books'], ['morning'], 1, 35.7039, 139.5795, 'Old-style coffee house: cups, silence, no laptop rule.'),
  v('harmonica', 'Harmonica Alley', 'kichijoji', 'alleys', ['ramen', 'wine'], ['evening'], 1, 35.7043, 139.5799, 'A maze of six-seat bars and yakitori counters.'),

  // Ebisu
  v('liquidroom', 'Liquidroom', 'ebisu', 'live house', ['indie-rock', 'techno'], ['evening'], 2, 35.647, 139.7104, 'Under the tracks, 900 capacity, a floor that moves.'),
  v('ebisu-yokocho', 'Ebisu Yokocho', 'ebisu', 'food alley', ['ramen', 'wine'], ['evening'], 1, 35.6465, 139.7097, 'Covered alley of tiny bars and grills.'),
  v('bar-trench', 'Bar Trench', 'ebisu', 'cocktail bar', ['wine', 'design'], ['evening'], 3, 35.6479, 139.7092, 'Twelve seats, an absinthe list, no standing.'),
  v('ebisu-books', 'Ebisu Book Cellar', 'ebisu', 'bookshop', ['books', 'art'], ['afternoon', 'evening'], 2, 35.6469, 139.7111, 'Art, photography, and a small magazine wall.'),
  v('ebisu-gallery', 'Ebisu Photo Gallery', 'ebisu', 'gallery', ['art', 'film'], ['afternoon'], 2, 35.6474, 139.7086, 'Photography only, one show at a time.'),
];

export const DISTRICT_BY_ID = new Map(DISTRICTS.map((district) => [district.id, district]));
export const VENUE_BY_ID = new Map(VENUES.map((venue) => [venue.id, venue]));

export type Budget = 1 | 2 | 3;

export interface ThreadRequest {
  city: string;
  days: number;
  interests: Interest[];
  budget: Budget;
}

export interface MatchedStop {
  venue: Venue;
  window: Window;
  /** How many of the selected interests this place covers. */
  hits: number;
  /** Internal ranking value, 0-100. Not shown as a percentage in the UI. */
  match: number;
  /** Minutes from the previous stop. */
  travelMinutes: number | null;
  travelMode: 'walk' | 'transit' | null;
  reason: string;
}

export interface DayPlan {
  index: number;
  district: District;
  stops: MatchedStop[];
  summary: string;
}

export interface SkippedVenue {
  venue: Venue;
  hits: number;
  match: number;
  reason: string;
}

export interface ThreadResult {
  mode: 'mock' | 'live';
  city: string;
  /** How many days the planner could actually fill. */
  days: number;
  /** What the user asked for. Can exceed `days` when the catalog runs out. */
  requestedDays: number;
  interests: Interest[];
  budget: Budget;
  plan: DayPlan[];
  skipped: SkippedVenue[];
  considered: number;
  candidates: number;
  /** In live mode: the entities Qloo resolved from the selected interests. */
  signals: string[];
  /** In live mode: how many Qloo calls this plan cost. */
  calls: number;
  /** Places Qloo returned without price data. They were not filtered out. */
  unpriced: number;
  notes: {
    data: string;
    scope: string;
  };
}
