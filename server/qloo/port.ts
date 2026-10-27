export type EnvelopeStatus = 'ok' | 'empty' | 'needs_input' | 'partial' | 'degraded' | 'error';

export interface EnvelopeError {
  code: string;
  retryable: boolean;
  recovery: string;
}

export interface Envelope<T> {
  status: EnvelopeStatus;
  summary: string;
  results: T[];
  result_count: number;
  error?: EnvelopeError;
}

export interface RankedOption {
  id: string;
  name: string;
  score: number;
  matchedTags: string[];
}

export interface RankInput {
  options: { id: string; name: string; type: string }[];
  optionType: string;
  signals: string[];
}

/** A place as Qloo describes it. Coordinates and ward come straight from the graph. */
export interface QlooPlace {
  id: string;
  name: string;
  ward: string;
  hood: string;
  lat: number | null;
  lon: number | null;
  description: string;
  tags: string[];
  /** Qloo's authoritative category, e.g. "Bookstore", "Bar", "Hotel". */
  primaryGenre: string;
  priceLevel: number | null;
}

export interface InsightsInput {
  location: string;
  take: number;
  signalEntities?: string[];
  filterTags?: string[];
}

export interface Capabilities {
  ready: boolean;
  harnessVersion: string | null;
  detail: string;
}

export interface QlooPort {
  readonly mode: 'mock' | 'live';
  capabilities(): Promise<Capabilities>;
  rank(input: RankInput): Promise<Envelope<RankedOption>>;
  /** Resolve a free-text name (artist, film, label) to entity ids. */
  searchEntities(query: string, take?: number): Promise<Envelope<{ id: string; name: string }>>;
  /** Resolve a concept to Qloo tag URNs. */
  findTags(query: string, take?: number): Promise<Envelope<{ id: string; name: string }>>;
  /** Places in a city, ranked against a taste signal. */
  insights(input: InsightsInput): Promise<Envelope<QlooPlace>>;
}

export const emptyEnvelope = <T>(summary: string, status: EnvelopeStatus = 'empty'): Envelope<T> => ({
  status,
  summary,
  results: [],
  result_count: 0,
});

export const errorEnvelope = <T>(
  code: string,
  summary: string,
  recovery: string,
  retryable = false,
): Envelope<T> => ({
  status: 'error',
  summary,
  results: [],
  result_count: 0,
  error: { code, retryable, recovery },
});
