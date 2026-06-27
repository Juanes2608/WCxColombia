import type { FinancialSummary } from "@/lib/types";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

interface Row {
  label: string;
  value: string;
  tone: "ink" | "good" | "warn" | "bad";
  hint: string;
}

const TONE: Record<Row["tone"], string> = {
  ink: "text-ink",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

export function FinancialPanel({ financial }: { financial: FinancialSummary }) {
  const rows: Row[] = [
    {
      label: "Flag rate (this document)",
      value: `${Math.round(financial.flag_rate * 100)}%`,
      tone: financial.flag_rate > 0 ? "bad" : "good",
      hint: "Share of citations not VERIFIED",
    },
    {
      label: "Time saved",
      value: gbp(financial.savings_gbp),
      tone: "good",
      hint: "4h manual review → ~4min",
    },
    {
      label: "Risk exposure avoided",
      value: gbp(financial.risk_ev_gbp),
      tone: financial.risk_ev_gbp > 0 ? "bad" : "good",
      hint: "Fabricated × £62k wasted-costs estimate",
    },
    {
      label: "Fabricated",
      value: String(financial.n_fabricated),
      tone: financial.n_fabricated > 0 ? "bad" : "ink",
      hint: "Count",
    },
    {
      label: "Misapplied",
      value: String(financial.n_misapplied),
      tone: financial.n_misapplied > 0 ? "warn" : "ink",
      hint: "Count",
    },
    {
      label: "Verified",
      value: String(financial.n_verified),
      tone: "good",
      hint: "Count",
    },
  ];

  return (
    <div className="rounded-xl border border-n300 bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-n700">
        Financial impact
      </h2>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-n100 pb-3 last:border-0 last:pb-0"
          >
            <dt>
              <span className="text-sm text-ink">{r.label}</span>
              <span className="block text-xs text-n500">{r.hint}</span>
            </dt>
            <dd className={`font-display text-xl font-semibold tabular-nums ${TONE[r.tone]}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-n500">
        Sources: Stanford arXiv:2401.01301 (hallucination baseline) · Law Society 2024 Salary
        Survey (£300/hr) · CPR r.44.11 wasted-costs precedents (£62k estimate). Figures computed
        deterministically, not LLM-generated.
      </p>
    </div>
  );
}