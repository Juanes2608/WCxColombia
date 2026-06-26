import type { FinancialSummary } from "@/lib/types";

interface Props {
  total: number;
  financial: FinancialSummary;
}

interface Card {
  label: string;
  value: number;
  /** Tint classes; muted when the count is zero. */
  active: string;
  on: boolean;
}

export function SummaryCards({ total, financial }: Props) {
  const cards: Card[] = [
    { label: "Total citations", value: total, active: "text-ink", on: true },
    {
      label: "Fabricated",
      value: financial.n_fabricated,
      active: "text-bad",
      on: financial.n_fabricated > 0,
    },
    {
      label: "Misapplied",
      value: financial.n_misapplied,
      active: "text-warn",
      on: financial.n_misapplied > 0,
    },
    {
      label: "Verified",
      value: financial.n_verified,
      active: "text-good",
      on: financial.n_verified > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-n300 bg-surface p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-n500">
            {c.label}
          </p>
          <p
            className={`mt-2 font-display text-3xl font-semibold tabular-nums ${
              c.on ? c.active : "text-ink-300"
            }`}
          >
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}