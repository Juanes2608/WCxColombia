import { Check, ShieldCheck, XCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

// A natural, realistic mock of the TraceIt results dashboard — the kind of
// thing you'd screenshot from the live app. Static on purpose (a real product
// screenshot doesn't dance); the only motion is a quiet "live" pulse on the hash.

type Tone = "bad" | "warn" | "good";

const SUMMARY: { label: string; value: number; tone: Tone | "ink" }[] = [
  { label: "Total", value: 3, tone: "ink" },
  { label: "Fabricated", value: 1, tone: "bad" },
  { label: "Misapplied", value: 1, tone: "warn" },
  { label: "Verified", value: 1, tone: "good" },
];

const NUM_COLOR: Record<Tone | "ink", string> = {
  ink: "text-paper-fixed",
  bad: "text-bad",
  warn: "text-warn",
  good: "text-good",
};

interface Row {
  cite: string;
  l1: { tone: Tone; label: string };
  l2: { tone: Tone | "muted"; label: string };
}

const ROWS: Row[] = [
  {
    cite: "Carlisle v Rookwood Holdings Ltd [2021] EWHC 4412",
    l1: { tone: "bad", label: "Fabricated" },
    l2: { tone: "muted", label: "—" },
  },
  {
    cite: "Pepper v Hart [1992] UKHL 3",
    l1: { tone: "warn", label: "Misapplied" },
    l2: { tone: "warn", label: "Distinguished" },
  },
  {
    cite: "Donoghue v Stevenson [1932] UKHL 100",
    l1: { tone: "good", label: "Verified" },
    l2: { tone: "good", label: "Good law" },
  },
];

const L1ICON = { bad: XCircle, warn: AlertTriangle, good: CheckCircle2 } as const;

const PILL: Record<Tone, string> = {
  bad: "bg-bad text-white border-bad",
  warn: "bg-warn-bg text-warn border-warn-bd",
  good: "bg-good-bg text-good border-good-bd",
};

const L2PILL: Record<Tone | "muted", string> = {
  bad: "text-bad",
  warn: "text-warn",
  good: "text-good",
  muted: "text-paper-fixed/35",
};

export function AppMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-fixed shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)] ring-1 ring-accent-lime/10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent-lime" aria-hidden="true" />
          <span className="font-display text-sm font-semibold text-paper-fixed">
            Trace<span className="text-accent-lime">It</span>
          </span>
          <span className="font-mono text-[11px] text-paper-fixed/40">· matter a4f9…c21</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-paper-fixed/45">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
          </span>
          sha256 verified
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-px bg-white/5">
        {SUMMARY.map((s) => (
          <div key={s.label} className="bg-surface-fixed px-3 py-3">
            <p className="font-mono text-[9px] uppercase tracking-wide text-paper-fixed/40">
              {s.label}
            </p>
            <p
              className={`mt-1 font-display text-2xl font-semibold tabular-nums ${NUM_COLOR[s.tone]}`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="px-1 py-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 font-mono text-[9px] uppercase tracking-wide text-paper-fixed/35">
          <span>Citation</span>
          <span className="text-right">Authenticity</span>
          <span className="text-right">Good law</span>
        </div>
        {ROWS.map((r) => {
          const Icon = L1ICON[r.l1.tone];
          return (
            <div
              key={r.cite}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-3 py-2.5 ${
                r.l1.tone === "bad" ? "bg-bad/10" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${L2PILL[r.l1.tone]}`} aria-hidden="true" />
                <span className="truncate font-mono text-xs text-paper-fixed/90">{r.cite}</span>
              </span>
              <span
                className={`justify-self-end rounded-md border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${PILL[r.l1.tone]}`}
              >
                {r.l1.label}
              </span>
              <span className={`justify-self-end font-mono text-[10px] ${L2PILL[r.l2.tone]}`}>
                {r.l2.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer — financial impact */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-paper-fixed/55">
          <Check className="h-3.5 w-3.5 text-accent-lime" aria-hidden="true" />
          Risk avoided
        </span>
        <span className="font-display text-base font-semibold text-accent-lime tabular-nums">
          £62,000
        </span>
      </div>
    </div>
  );
}
