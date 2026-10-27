/**
 * The city list.
 *
 * Names only — no coordinates. Qloo returns `location.lat/lon` for every place,
 * and the clustering works off those, so the city record is purely for the
 * picker and for the `--filter-location` string.
 *
 * Every entry passed `npm run cities:check`. Ten cities that returned zero
 * places from Qloo were removed rather than shipped as dead options:
 * Copenhagen, Edinburgh, Shanghai, Chengdu, Alexandria, Addis Ababa,
 * Johannesburg, Riyadh, Perth and Nadi. Re-run the sweep before adding any.
 */

export interface City {
  id: string;
  name: string;
  country: string;
  countryCode: string;
}

const RAW = `
London|United Kingdom|GB
Paris|France|FR
Berlin|Germany|DE
Madrid|Spain|ES
Barcelona|Spain|ES
Rome|Italy|IT
Milan|Italy|IT
Venice|Italy|IT
Amsterdam|Netherlands|NL
Brussels|Belgium|BE
Vienna|Austria|AT
Prague|Czechia|CZ
Budapest|Hungary|HU
Warsaw|Poland|PL
Krakow|Poland|PL
Stockholm|Sweden|SE
Oslo|Norway|NO
Helsinki|Finland|FI
Reykjavik|Iceland|IS
Dublin|Ireland|IE
Lisbon|Portugal|PT
Porto|Portugal|PT
Athens|Greece|GR
Istanbul|Turkey|TR
Zurich|Switzerland|CH
Munich|Germany|DE
Naples|Italy|IT
Seville|Spain|ES
New York|United States|US
Los Angeles|United States|US
Chicago|United States|US
San Francisco|United States|US
Seattle|United States|US
Portland|United States|US
Austin|United States|US
Boston|United States|US
Miami|United States|US
New Orleans|United States|US
Nashville|United States|US
Denver|United States|US
Toronto|Canada|CA
Vancouver|Canada|CA
Montreal|Canada|CA
Mexico City|Mexico|MX
Guadalajara|Mexico|MX
Oaxaca|Mexico|MX
Bogota|Colombia|CO
Medellin|Colombia|CO
Lima|Peru|PE
Santiago|Chile|CL
Buenos Aires|Argentina|AR
Sao Paulo|Brazil|BR
Rio de Janeiro|Brazil|BR
Tokyo|Japan|JP
Osaka|Japan|JP
Kyoto|Japan|JP
Seoul|South Korea|KR
Busan|South Korea|KR
Beijing|China|CN
Hong Kong|Hong Kong|HK
Taipei|Taiwan|TW
Singapore|Singapore|SG
Bangkok|Thailand|TH
Chiang Mai|Thailand|TH
Hanoi|Vietnam|VN
Ho Chi Minh City|Vietnam|VN
Phnom Penh|Cambodia|KH
Kuala Lumpur|Malaysia|MY
Jakarta|Indonesia|ID
Denpasar|Indonesia|ID
Manila|Philippines|PH
Delhi|India|IN
Mumbai|India|IN
Bangalore|India|IN
Kolkata|India|IN
Colombo|Sri Lanka|LK
Kathmandu|Nepal|NP
Dhaka|Bangladesh|BD
Tashkent|Uzbekistan|UZ
Almaty|Kazakhstan|KZ
Ulaanbaatar|Mongolia|MN
Cairo|Egypt|EG
Marrakech|Morocco|MA
Casablanca|Morocco|MA
Tunis|Tunisia|TN
Dakar|Senegal|SN
Accra|Ghana|GH
Lagos|Nigeria|NG
Nairobi|Kenya|KE
Cape Town|South Africa|ZA
Kigali|Rwanda|RW
Kampala|Uganda|UG
Zanzibar City|Tanzania|TZ
Tel Aviv|Israel|IL
Jerusalem|Israel|IL
Amman|Jordan|JO
Beirut|Lebanon|LB
Dubai|United Arab Emirates|AE
Abu Dhabi|United Arab Emirates|AE
Doha|Qatar|QA
Muscat|Oman|OM
Tehran|Iran|IR
Sydney|Australia|AU
Melbourne|Australia|AU
Brisbane|Australia|AU
Auckland|New Zealand|NZ
Wellington|New Zealand|NZ
Christchurch|New Zealand|NZ
Honolulu|United States|US
Port Moresby|Papua New Guinea|PG
`.trim();

const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const seen = new Map<string, number>();

export const CITIES: City[] = RAW.split('\n').map((line) => {
  const [name, country, countryCode] = line.split('|') as [string, string, string];
  const base = slug(name);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  const id = count === 0 ? base : `${base}-${countryCode.toLowerCase()}`;
  return { id, name, country, countryCode };
});

export const CITY_BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export const MAX_CITY_LENGTH = 80;
const CITY_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s,'.\-]*$/u;

export interface ResolvedCity {
  /** What we send to Qloo's `--filter-location`. */
  name: string;
  /** The catalog entry, when the input was one of ours. */
  city: City | null;
}

/**
 * Accepts an id, a catalog name, or free text.
 *
 * Free text is deliberately allowed: Qloo resolves `Paris` to Paris, France and
 * `Cambridge` to the UK one, so a closed list would be an artificial limit.
 */
export function resolveCity(input: unknown): ResolvedCity {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { name: '', city: null };

  const byId = CITY_BY_ID.get(raw.toLowerCase());
  if (byId) return { name: byId.name, city: byId };

  const lower = raw.toLowerCase();
  const byName = CITIES.find((city) => city.name.toLowerCase() === lower);
  if (byName) return { name: byName.name, city: byName };

  const clipped = raw.slice(0, MAX_CITY_LENGTH);
  if (!CITY_PATTERN.test(clipped)) return { name: '', city: null };

  return { name: clipped, city: null };
}
