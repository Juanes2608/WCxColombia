import { confidenceBand, type VerdictTone } from "@/lib/verdict-map";

const TRACK: Record<VerdictTone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  unk: "bg-unk",
};

interface Props {
  value: number; // 0.0–1.0
  variant?: "row" | "detail";
}

export function ConfidenceMeter({ value, variant = "row" }: Props) {
  const { tone, label, note } = confidenceBand(value);
  const pct = Math.round(value * 100);

  if (variant === "row") {
    return (
      <div className="flex items-center gap-2" title={`Confidence ${value.toFixed(2)} — ${label}`}>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-n300">
          <div className={`h-full rounded-full ${TRACK[tone]}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-xs text-ink-300">{value.toFixed(2)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-n500">
          Confidence
        </span>
        <span className="font-mono text-sm text-ink">
          {value.toFixed(2)} · {label}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-n300">
        <div className={`h-full rounded-full ${TRACK[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-n500">
        {note} Deterministic lookup; a verdict at 0.74 is not a verdict at 1.00.
      </p>
    </div>
  );
}