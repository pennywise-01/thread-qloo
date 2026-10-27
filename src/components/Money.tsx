/**
 * A generic banknote. Never a currency symbol.
 *
 * Qloo normalises `price_range.currency` to USD for every city, so any `$`/`€`/`¥`
 * glyph would be wrong wherever the user is. One mark per tier: ▪ Budget,
 * ▪▪ Mid, ▪▪▪ Any.
 */
export function Money({ count, small = false }: { count: number; small?: boolean }) {
  const marks = Math.max(1, Math.min(3, Math.round(count) || 1));

  return (
    <span
      className={`money${small ? ' money-sm' : ''}`}
      aria-hidden="true"
      title={`Price tier ${marks} of 3`}
    >
      {Array.from({ length: marks }).map((_, index) => (
        <svg key={index} viewBox="0 0 18 11">
          <rect
            x="0.7"
            y="0.7"
            width="16.6"
            height="9.6"
            rx="1.6"
            fill="currentColor"
            fillOpacity="0.16"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle
            cx="9"
            cy="5.5"
            r="2"
            fill="currentColor"
            fillOpacity="0.9"
            stroke="none"
          />
        </svg>
      ))}
    </span>
  );
}
