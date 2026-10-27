import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  emptyEnvelope,
  errorEnvelope,
  type Capabilities,
  type Envelope,
  type EnvelopeStatus,
  type InsightsInput,
  type QlooPlace,
  type QlooPort,
  type RankInput,
  type RankedOption,
} from './port';
import { findPersonalFields, sanitizeRankInput } from './sanitize';

const run = promisify(execFile);

const STATUSES: EnvelopeStatus[] = ['ok', 'empty', 'needs_input', 'partial', 'degraded', 'error'];
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_BUFFER = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * Live adapter over the hackathon harness.
 *
 * Three surfaces, three jobs:
 *   - `api insights`   discover real places in a city from a taste signal
 *   - `api search`     resolve an artist/film/label name to an entity id
 *   - `exec find_tags` resolve a concept ("specialty coffee") to a tag URN
 *
 * The harness is started through node + the CLI entrypoint on Windows rather
 * than a `.cmd` shim, so nothing we pass is ever concatenated into a shell.
 */
export class ExecQlooAdapter implements QlooPort {
  readonly mode = 'live' as const;

  private readonly prefix: string[];
  private readonly command: string;
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private capabilitiesCache: { at: number; value: Capabilities } | null = null;

  constructor() {
    const invocation = resolveInvocation(process.env.QLOO_BIN ?? 'qloo');
    this.command = invocation.command;
    this.prefix = invocation.prefix;
  }

  async capabilities(): Promise<Capabilities> {
    if (this.capabilitiesCache && Date.now() - this.capabilitiesCache.at < 60_000) {
      return this.capabilitiesCache.value;
    }

    let value: Capabilities;
    try {
      const { stdout } = await run(this.command, [...this.prefix, '--version'], {
        timeout: 10_000,
        windowsHide: true,
        env: process.env,
      });
      const version = stdout.trim().split(/\s+/)[0] ?? null;

      let ready = Boolean(process.env.QLOO_API_KEY);
      let detail = ready
        ? 'Credential present in the environment.'
        : 'No QLOO_API_KEY in the environment; run `qloo setup --qloo` or set the variable.';

      if (!ready) {
        const status = await run(this.command, [...this.prefix, 'setup', '--status'], {
          timeout: 10_000,
          windowsHide: true,
          env: process.env,
        }).catch(() => null);
        const line = status?.stdout.split(/\r?\n/).find((entry) => entry.includes('Qloo data:'));
        if (line && !/no api credential|learning mode/i.test(line)) {
          ready = true;
          detail = line.trim();
        } else if (line) {
          detail = line.trim();
        }
      }

      value = { ready, harnessVersion: version, detail };
    } catch (error) {
      value = {
        ready: false,
        harnessVersion: null,
        detail: `Harness not reachable: ${describeError(error)}. Install with \`npm install --global @qloo/qloo-harness\`.`,
      };
    }

    this.capabilitiesCache = { at: Date.now(), value };
    return value;
  }

  async searchEntities(query: string, take = 1): Promise<Envelope<{ id: string; name: string }>> {
    const trimmed = query.trim();
    if (!trimmed) return emptyEnvelope('No query supplied.');

    const raw = await this.cached(`search:${trimmed}:${take}`, () =>
      this.call(['api', 'search', '--query', trimmed, '--take', String(take), '--json']),
    );

    const list = Array.isArray(raw) ? raw : [];
    const results = list
      .map((item) => {
        const node = asRecord(item);
        const id = node ? (asString(node.entity_id) ?? asString(node.id)) : null;
        const name = node ? asString(node.name) : null;
        return id && name ? { id, name } : null;
      })
      .filter((entry): entry is { id: string; name: string } => entry !== null);

    return {
      status: results.length > 0 ? 'ok' : 'empty',
      summary: results.length > 0 ? `Resolved "${trimmed}".` : `No entity for "${trimmed}".`,
      results,
      result_count: results.length,
    };
  }

  async findTags(query: string, take = 3): Promise<Envelope<{ id: string; name: string }>> {
    const raw = await this.cached(`tags:${query}:${take}`, () =>
      this.workflow('find_tags', { query, limit: take }),
    );
    const record = asRecord(raw);
    const list = record && Array.isArray(record.results) ? record.results : [];

    const results = list
      .map((item) => {
        const node = asRecord(item);
        const id = node ? (asString(node.id) ?? asString(node.tag_id)) : null;
        const name = node ? asString(node.name) : null;
        return id ? { id, name: name ?? id } : null;
      })
      .filter((entry): entry is { id: string; name: string } => entry !== null);

    return {
      status: results.length > 0 ? 'ok' : 'empty',
      summary: `Tags for "${query}".`,
      results,
      result_count: results.length,
    };
  }

  async insights(input: InsightsInput): Promise<Envelope<QlooPlace>> {
    const args = [
      'api',
      'insights',
      '--type',
      'urn:entity:place',
      '--filter-location',
      input.location,
      '--take',
      String(input.take),
      '--json',
    ];

    if (input.signalEntities?.length) args.push('--signal-entities', input.signalEntities.join(','));
    if (input.filterTags?.length) args.push('--filter-tags', input.filterTags.join(','));

    if (!input.signalEntities?.length && !input.filterTags?.length) {
      return emptyEnvelope('Insights needs a signal or a filter.');
    }

    const key = `insights:${input.location}:${input.take}:${(input.signalEntities ?? []).join(',')}:${(input.filterTags ?? []).join(',')}`;
    const raw = await this.cached(key, () => this.call(args));
    if (!raw) {
      return errorEnvelope(
        'QLOO_PARSE',
        'The insights request returned nothing parseable.',
        'Run the same command with --verbose to inspect the raw response.',
      );
    }

    // The CLI prints `{ "error": true, "code": "API_ERROR", "message": "… 400 Bad Request" }`
    // on a rejected request. Treat that as an error, not an empty result set.
    const failure = asRecord(raw);
    if (failure && failure.error) {
      return errorEnvelope(
        asString(failure.code) ?? 'QLOO_ERROR',
        asString(failure.message) ?? 'Qloo rejected the insights request.',
        'Check the request shape — `--take` above ~55 is rejected.',
      );
    }

    const list = Array.isArray(raw) ? raw : [];
    const places = list
      .map((item) => normalizePlace(item))
      .filter((place): place is QlooPlace => place !== null);

    return {
      status: places.length > 0 ? 'ok' : 'empty',
      summary: `${places.length} places in ${input.location}.`,
      results: places,
      result_count: places.length,
    };
  }

  async rank(input: RankInput): Promise<Envelope<RankedOption>> {
    const sanitized = sanitizeRankInput(input);
    if (sanitized.options.length === 0 || sanitized.signals.length === 0) {
      return emptyEnvelope('No rankable options or signals after sanitising.');
    }

    const payload = {
      options: sanitized.options.map((option) => option.id),
      option_type: process.env.QLOO_OPTION_TYPE ?? 'urn:entity:place',
      signals: sanitized.signals,
    };

    const violations = findPersonalFields(payload);
    if (violations.length > 0) {
      return errorEnvelope(
        'PRIVACY_GUARD',
        `Refused to send a payload containing ${violations.join(', ')}.`,
        'Only public entity identifiers may leave this process.',
      );
    }

    const raw = await this.cached(`rank:${JSON.stringify(payload)}`, () =>
      this.workflow('rank', payload),
    );
    return normalizeRankOutput(raw, sanitized.options);
  }

  private async workflow(operation: string, payload: unknown): Promise<unknown> {
    const dir = await mkdtemp(path.join(tmpdir(), 'thread-'));
    const file = path.join(dir, 'request.json');
    try {
      await writeFile(file, JSON.stringify(payload), 'utf8');
      return await this.call(['exec', operation, '--input-file', file]);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async cached(key: string, load: () => Promise<unknown>): Promise<unknown> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async call(args: string[]): Promise<unknown> {
    try {
      const { stdout } = await run(this.command, [...this.prefix, ...args], {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: process.env,
      });
      return extractJson(stdout);
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout;
      return stdout ? extractJson(stdout) : null;
    }
  }
}

function resolveInvocation(bin: string): { command: string; prefix: string[] } {
  if (process.platform !== 'win32') return { command: bin, prefix: [] };

  const harnessEntry = path.join('node_modules', '@qloo', 'qloo-harness', 'dist', 'bin.js');
  const candidates = [
    path.join(path.dirname(process.execPath), harnessEntry),
    path.join(process.env.APPDATA ?? '', 'npm', harnessEntry),
    path.join(process.env.ProgramFiles ?? '', 'nodejs', harnessEntry),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: process.execPath, prefix: [candidate] };
  }
  return { command: bin, prefix: [] };
}

/**
 * The harness prints a human note ("Using signal: …") after some payloads, so
 * a plain JSON.parse on stdout fails. Trim trailing lines until it parses.
 */
function extractJson(stdout: string): unknown {
  const text = stdout.trim();
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  for (let end = lines.length; end > 0; end -= 1) {
    const candidate = lines.slice(0, end).join('\n').trim();
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

function normalizePlace(item: unknown): QlooPlace | null {
  const node = asRecord(item);
  if (!node) return null;

  const id = asString(node.entity_id) ?? asString(node.id);
  const name = asString(node.name);
  if (!id || !name) return null;

  const properties = asRecord(node.properties) ?? {};
  const geocode = asRecord(properties.geocode) ?? {};
  const location = asRecord(node.location) ?? {};
  const genre = asRecord(properties.primary_genre) ?? {};
  const tags = Array.isArray(node.tags)
    ? node.tags
        .map((tag) => asString(asRecord(tag)?.name))
        .filter((tag): tag is string => Boolean(tag))
    : [];

  return {
    id,
    name,
    ward: asString(geocode.city) ?? asString(geocode.admin2_region) ?? 'Tokyo',
    hood: asString(geocode.name) ?? asString(properties.neighborhood) ?? '',
    lat: asNumber(location.lat),
    lon: asNumber(location.lon),
    description:
      asString(properties.short_description) ??
      asString(properties.description) ??
      asString(properties.overall_description) ??
      '',
    tags,
    // Place records carry ~100 loose tags; `primary_genre` is the real category.
    primaryGenre: asString(genre.name) ?? '',
    priceLevel: asNumber(properties.price_level),
  };
}

function normalizeRankOutput(
  parsed: unknown,
  options: { id: string; name?: string }[],
): Envelope<RankedOption> {
  const record = asRecord(parsed);
  const status =
    record && typeof record.status === 'string' && STATUSES.includes(record.status as EnvelopeStatus)
      ? (record.status as EnvelopeStatus)
      : null;

  if (status === 'error' || (record && record.error && !status)) {
    const error = asRecord(record?.error);
    return errorEnvelope(
      asString(error?.code) ?? 'QLOO_ERROR',
      asString(record?.summary) ?? asString(error?.message) ?? 'The rank workflow failed.',
      asString(error?.recovery) ?? 'Check `qloo setup --status` and retry.',
      Boolean(error?.retryable),
    );
  }

  const raw =
    (record && Array.isArray(record.results) ? record.results : null) ??
    (Array.isArray(parsed) ? parsed : null) ??
    [];

  const byId = new Map(options.map((option) => [option.id, option.name]));
  const candidates: RankedOption[] = [];

  for (const item of raw) {
    const node = asRecord(item);
    if (!node) continue;
    const entity = asRecord(node.entity) ?? node;
    const id =
      asString(node.id) ?? asString(node.entity_id) ?? asString(entity.id) ?? asString(entity.urn);
    if (!id) continue;

    const rawScore =
      asNumber(node.score) ??
      asNumber(node.affinity) ??
      asNumber(node.relevance) ??
      asNumber(node.weight) ??
      asNumber(node.match);
    if (rawScore === null) continue;

    const score = rawScore <= 1.01 ? rawScore * 100 : rawScore;

    candidates.push({
      id,
      name: asString(node.name) ?? asString(entity.name) ?? byId.get(id) ?? id,
      score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10,
      matchedTags: [],
    });
  }

  if (candidates.length === 0) {
    return {
      status: 'degraded',
      summary: 'The rank workflow responded but no option scores could be read.',
      results: [],
      result_count: 0,
    };
  }

  return {
    status,
    summary: asString(record?.summary) ?? `Ranked ${candidates.length} options.`,
    results: candidates,
    result_count: candidates.length,
  } as Envelope<RankedOption>;
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return error instanceof Error ? error.message : 'unknown error';
}
