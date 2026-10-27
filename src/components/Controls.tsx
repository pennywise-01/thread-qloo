import { useEffect, useState } from 'react';
import type { City } from '../../shared/cities';
import type { Budget, Interest } from '../../shared/thread';
import { Money } from './Money';

export interface Availability {
  city: string;
  live: boolean;
  sampled: number;
  supply: Record<string, number>;
  measured: string[];
}

interface Options {
  mode: 'mock' | 'live';
  cities: City[];
  interests: { id: Interest; label: string; hint: string }[];
  budgets: { value: Budget; label: string; hint: string }[];
}

interface Props {
  options: Options | null;
  city: string;
  availability: Availability | null;
  probing: boolean;
  days: number;
  budget: Budget;
  interests: Interest[];
  loading: boolean;
  error: string | null;
  ready: boolean;
  onCity: (city: string) => void;
  onDays: (days: number) => void;
  onBudget: (budget: Budget) => void;
  onToggle: (interest: Interest) => void;
  onBuild: () => void;
}

const PRESETS = [2, 3, 5, 7, 14];

/** Below this many sampled places, the probe cannot say what is missing. */
const MIN_SAMPLE = 15;

export function Controls({
  options,
  city,
  availability,
  probing,
  days,
  budget,
  interests,
  loading,
  error,
  ready,
  onCity,
  onDays,
  onBudget,
  onToggle,
  onBuild,
}: Props) {
  const [query, setQuery] = useState(city);
  const [open, setOpen] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);

  useEffect(() => setQuery(city), [city]);

  const q = query.trim().toLowerCase();
  const cities = options?.cities ?? [];
  const exact = cities.some((entry) => entry.name.toLowerCase() === q);
  const matches = cities
    .filter(
      (entry) =>
        !q || entry.name.toLowerCase().includes(q) || entry.country.toLowerCase().includes(q),
    )
    .slice(0, 8);

  const supply = availability?.supply ?? {};
  const measured = new Set(availability?.measured ?? []);
  const unavailable = (interest: Interest) => measured.has(interest) && (supply[interest] ?? 0) === 0;

  const items = options?.interests ?? [];
  // Only split the list when the sample is big enough to mean something. A city
  // that yielded four places tells us nothing about what is missing there.
  const grouped =
    availability !== null && measured.size > 0 && availability.sampled >= MIN_SAMPLE;
  const shown = grouped ? items.filter((entry) => !unavailable(entry.id)) : items;
  const hidden = grouped ? items.filter((entry) => unavailable(entry.id)) : [];
  const hiddenSelected = hidden.filter((entry) => interests.includes(entry.id));

  const pick = (name: string) => {
    onCity(name);
    setQuery(name);
    setOpen(false);
  };

  // A city the probe found nothing in cannot produce a plan. Say so up front.
  const dead = availability !== null && availability.live && availability.sampled === 0;
  const budgetHint = options?.budgets.find((entry) => entry.value === budget)?.hint ?? '';

  return (
    <>
      <section className="panel">
        <h2 className="panel-title">The trip</h2>

        <div className="field">
          <span className="field-label">City</span>
          <div className="combo">
            <input
              className="combo-input"
              aria-label="City"
              value={query}
              placeholder="Search a city, or type any"
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const first = matches[0];
                if (first && q) pick(first.name);
                else if (query.trim()) pick(query.trim());
              }}
            />
            {open && (q || matches.length > 0) && (
              <div className="combo-menu" role="listbox">
                {matches.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={entry.name === city}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(entry.name)}
                  >
                    <span>{entry.name}</span>
                    <em>{entry.country}</em>
                  </button>
                ))}
                {q && !exact && (
                  <button
                    type="button"
                    className="combo-free"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(query.trim())}
                  >
                    Use “{query.trim()}”
                  </button>
                )}
              </div>
            )}
          </div>
          {options?.mode === 'mock' && (
            <p className="field-hint">Offline mode is Tokyo only — set QLOO_MODE=live for other cities.</p>
          )}
        </div>

        <div className="field">
          <span className="field-label">Days on the ground</span>
          <div className="day-row">
            <input
              type="number"
              min={1}
              max={30}
              inputMode="numeric"
              aria-label="Days"
              value={days}
              onChange={(event) => onDays(Number(event.target.value))}
            />
            <span className="day-unit">days</span>
          </div>
          <div className="day-presets">
            {PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                className={value === days ? 'on' : ''}
                onClick={() => onDays(value)}
              >
                {value === 14 ? '2 weeks' : value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Budget</span>
          <div className="segmented wide budget-row" role="radiogroup" aria-label="Budget">
            {(options?.budgets ?? []).map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={entry.value === budget}
                className={entry.value === budget ? 'on' : ''}
                title={entry.hint}
                onClick={() => onBudget(entry.value)}
              >
                <Money count={entry.value} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
          {budgetHint && <p className="field-hint">{budgetHint}</p>}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          What you are here for
          {probing && <span className="probing"> · checking {city}…</span>}
        </h2>

        <div className={`interest-grid${probing ? ' is-probing' : ''}`}>
          {shown.map((interest) => {
            const on = interests.includes(interest.id);
            return (
              <button
                key={interest.id}
                type="button"
                className={`interest${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onToggle(interest.id)}
              >
                <span className="interest-label">
                  {interest.label}
                  {grouped && (
                    <span className="supply">{supply[interest.id] ?? 0}</span>
                  )}
                </span>
                <span className="interest-hint">{interest.hint}</span>
              </button>
            );
          })}
        </div>

        {grouped && hidden.length > 0 && (
          <div className="unavailable">
            <button type="button" className="unavailable-toggle" onClick={() => setShowUnavailable((v) => !v)}>
              {showUnavailable ? '−' : '+'} {hidden.length} not found in {city}
              {hiddenSelected.length > 0 && ` · ${hiddenSelected.length} still selected`}
            </button>
            {showUnavailable && (
              <div className="unavailable-list">
                {hidden.map((interest) => (
                  <button
                    key={interest.id}
                    type="button"
                    className={`interest small${interests.includes(interest.id) ? ' on' : ''}`}
                    aria-pressed={interests.includes(interest.id)}
                    onClick={() => onToggle(interest.id)}
                  >
                    <span className="interest-label">{interest.label}</span>
                    <span className="interest-hint">nothing matched here</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" className="run" onClick={onBuild} disabled={loading || !ready || dead}>
          {loading ? 'Building…' : `Build ${days} day${days === 1 ? '' : 's'}`}
        </button>

        {dead && (
          <div className="error">
            Qloo has no place data for {city} yet. Try another city — the probe found nothing to rank.
          </div>
        )}

        {!ready && <p className="field-hint">Pick at least two.</p>}
        {availability && availability.live && availability.sampled > 0 && (
          <p className="field-hint">
            Measured from {availability.sampled} places in {availability.city}.
          </p>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    </>
  );
}
