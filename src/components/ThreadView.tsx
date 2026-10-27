import type { ThreadResult, Window } from '../../shared/thread';
import { Money } from './Money';

const WINDOW_LABEL: Record<Window, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export function ThreadView({ result }: { result: ThreadResult }) {
  const stops = result.plan.reduce((sum, day) => sum + day.stops.length, 0);

  return (
    <>
      <div className="plan-head">
        <div>
          <h2 className="plan-title">
            {result.days} day{result.days === 1 ? '' : 's'} in {result.city}
          </h2>
          <p className="plan-sub">
            {stops} stops · {result.plan.length} neighbourhood
            {result.plan.length === 1 ? '' : 's'} · {result.interests.length} interests ·{' '}
            {result.candidates} places scored
          </p>
          {result.signals.length > 0 && (
            <p className="plan-signals">
              Qloo signals: {result.signals.join(' · ')} · {result.calls} calls
            </p>
          )}
        </div>
      </div>

      {result.requestedDays > result.days && (
        <p className="plan-warn">
          You asked for {result.requestedDays} days. {result.city} fills {result.days} at this
          budget — everything else is either over budget or outside the interests you picked.
        </p>
      )}

      <div className="days">
        {result.plan.map((day) => (
          <article className="day" key={`${day.district.id}-${day.index}`}>
            <header className="day-head">
              <span className="day-index">Day {day.index}</span>
              <h3 className="day-name">{day.district.name}</h3>
              <p className="day-character">{day.district.character}</p>
            </header>

            <ol className="stops">
              {day.stops.map((stop) => (
                <li className="stop" key={stop.venue.id}>
                  {stop.travelMinutes !== null && (
                    <div className="walk">
                      ↳ {stop.travelMinutes} min {stop.travelMode === 'transit' ? 'by train' : 'walk'}
                    </div>
                  )}
                  <div className="stop-row">
                    <span className="stop-window">{WINDOW_LABEL[stop.window]}</span>
                    <span className="stop-top">
                      {stop.hits} of {result.interests.length}
                    </span>
                  </div>
                  <h4 className="stop-name">{stop.venue.name}</h4>
                  <div className="stop-meta">
                    <span>{stop.venue.kind}</span>
                    <span className="dot-sep">·</span>
                    <Money count={stop.venue.price} small />
                  </div>
                  <p className="stop-note">{stop.venue.note}</p>
                  <p className="stop-reason">{stop.reason}</p>
                </li>
              ))}
            </ol>

            {day.stops.length < 2 && (
              <p className="day-note">
                Only one place in this neighbourhood cleared your filters. Widen the interests or add
                days to trade this stop for a fuller day elsewhere.
              </p>
            )}
          </article>
        ))}
      </div>

      {result.skipped.length > 0 && (
        <section className="skipped">
          <h3 className="skipped-title">And what we skipped</h3>
          <p className="skipped-sub">
            The obvious stops, measured against the same interests. Every one of these is good. None
            of them was the best use of your slot.
          </p>
          <ul>
            {result.skipped.map((entry) => (
              <li key={entry.venue.id}>
                <span className="skip-name">{entry.venue.name}</span>
                <span className="skip-top">
                  {entry.hits} of {result.interests.length}
                </span>
                <span className="skip-reason">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="footnotes">
        <div>
          <b>Ranking.</b> {result.notes.data}
        </div>
        <div>
          <b>Practical.</b> {result.notes.scope}
        </div>
        {result.unpriced > 0 && (
          <div>
            <b>Price data.</b> {result.unpriced} place{result.unpriced === 1 ? '' : 's'} had no price
            listed and {result.unpriced === 1 ? 'was' : 'were'} not filtered by budget.
          </div>
        )}
      </div>
    </>
  );
}
