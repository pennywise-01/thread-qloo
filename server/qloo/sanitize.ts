import type { RankInput, RankedOption } from './port';

/**
 * The single place where a request leaves our process.
 *
 * Two rules from the event guide are enforced structurally, not by convention:
 *   1. No personal data. Person labels, typed seeds and anything identifying
 *      never reach this layer — callers pass entity identifiers only.
 *   2. No unbounded payloads. Options and signals are capped before dispatch.
 */

const MAX_OPTIONS = 40;
const MAX_SIGNALS = 25;
const ID_PATTERN = /^[A-Za-z0-9:_\-.]{1,160}$/;

/**
 * Person-shaped fields. Note that `name` is deliberately absent: an option's
 * name is a venue, which is public catalog data, not a person.
 */
const PERSON_FIELDS = new Set([
  'email',
  'phone',
  'personName',
  'firstName',
  'lastName',
  'fullName',
  'deviceId',
  'userId',
  'accountId',
  'address',
  'birthDate',
  'label',
]);

const isSafeId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value);

export interface SanitizedRankInput {
  options: { id: string; name: string }[];
  optionType: string;
  signals: string[];
  dropped: number;
}

export function sanitizeRankInput(input: RankInput): SanitizedRankInput {
  const seen = new Set<string>();
  const options: { id: string; name: string }[] = [];
  let dropped = 0;

  for (const option of input.options) {
    if (!isSafeId(option.id)) {
      dropped += 1;
      continue;
    }
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    options.push({ id: option.id, name: String(option.name).slice(0, 120) });
    if (options.length >= MAX_OPTIONS) break;
  }

  const signals = [...new Set(input.signals.filter(isSafeId))].slice(0, MAX_SIGNALS);

  return { options, optionType: input.optionType.slice(0, 40), signals, dropped };
}

/** Returns the paths of any person-shaped field found in an outgoing payload. */
export function findPersonalFields(payload: unknown): string[] {
  const violations: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (PERSON_FIELDS.has(key)) violations.push(`${path}.${key}`);
      walk(value, `${path}.${key}`);
    }
  };
  walk(payload, '$');
  return violations;
}

export type { RankedOption };
