const GBP_FMT = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function formatGBP(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return GBP_FMT.format(Math.round(n));
}

export function formatPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatRatio(n: number): string {
  if (n === Infinity) return "∞";
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}×`;
}

export function formatMonths(n: number | null): string {
  if (n === null) return "aún no";
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} meses`;
}
