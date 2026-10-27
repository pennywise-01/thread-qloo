import { useEffect, useState } from 'react';
import { Controls, type Availability } from './components/Controls';
import { ThreadView } from './components/ThreadView';
import type { Budget, Interest, ThreadResult } from '../shared/thread';

interface Options {
  mode: 'mock' | 'live';
  cities: { id: string; name: string; country: string; countryCode: string }[];
  interests: { id: Interest; label: string; hint: string }[];
  budgets: { value: Budget; label: string; hint: string }[];
}

const DEFAULT_INTERESTS: Interest[] = ['vinyl', 'coffee', 'indie-rock'];

export default function App() {
  const [options, setOptions] = useState<Options | null>(null);
  const [city, setCity] = useState('Tokyo');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [probing, setProbing] = useState(false);
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState<Budget>(2);
  const [interests, setInterests] = useState<Interest[]>(DEFAULT_INTERESTS);
  const [result, setResult] = useState<ThreadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/thread/options')
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('Options unavailable')),
      )
      .then(setOptions)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  // Availability is measured, not guessed: one cached Qloo call per city.
  useEffect(() => {
    if (!city) {
      setAvailability(null);
      return;
    }

    let cancelled = false;
    setProbing(true);

    const timer = window.setTimeout(() => {
      fetch(`/api/thread/availability?city=${encodeURIComponent(city)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no probe'))))
        .then((data: Availability) => {
          if (!cancelled) setAvailability(data);
        })
        .catch(() => {
          if (!cancelled) setAvailability(null);
        })
        .finally(() => {
          if (!cancelled) setProbing(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setProbing(false);
    };
  }, [city]);

  const chooseCity = (next: string) => {
    setCity(next);
    setResult(null);
    setError(null);
  };

  const setDaysSafe = (value: number) => {
    if (!Number.isFinite(value)) return;
    setDays(Math.max(1, Math.min(30, Math.round(value))));
  };

  const toggle = (interest: Interest) => {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((entry) => entry !== interest)
        : [...current, interest],
    );
  };

  const build = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/thread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city, days, interests, budget }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Could not build a thread');
      setResult(payload as ThreadResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build a thread');
    } finally {
      setLoading(false);
    }
  };

  const ready = interests.length >= 2;

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1 className="wordmark">
            Th<span>read</span>
          </h1>
          <p className="tagline">
            Not the top ten. One neighbourhood a day, chosen from what you actually like — and a list
            of what we skipped, with the reason.
          </p>
        </div>
        <div className="badges">
          <span className={`badge ${options?.mode === 'live' ? 'live' : 'mock'}`}>
            {options?.mode === 'live' ? 'Ranked by Qloo' : 'Local ranking'}
          </span>
          <span className="badge">{city}</span>
        </div>
      </header>

      <div className="layout">
        <div>
          <Controls
            options={options}
            city={city}
            availability={availability}
            probing={probing}
            days={days}
            budget={budget}
            interests={interests}
            loading={loading}
            error={error}
            ready={ready}
            onCity={chooseCity}
            onDays={setDaysSafe}
            onBudget={setBudget}
            onToggle={toggle}
            onBuild={build}
          />
        </div>

        <main>
          {!result && !loading && (
            <div className="empty">
              <h2>{city}, one thread at a time.</h2>
              <p>
                Pick how long you are there and the things you actually care about. Thread finds the
                neighbourhoods where those overlap, orders the stops so you can walk them, and tells
                you what it left out.
              </p>
            </div>
          )}

          {loading && !result && (
            <div className="panel">
              <p className="loading-line">Scoring {city} · building the route…</p>
            </div>
          )}

          {result && <ThreadView result={result} />}
        </main>
      </div>
    </div>
  );
}
