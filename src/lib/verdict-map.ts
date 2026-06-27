// TraceIt — single source of truth for verdict → icon + label + colour.
// No verdict colour is ever used without its icon AND text label (R2/R9).

import {
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { AuthenticityVerdict, GoodLawVerdict } from "./types";

export type VerdictTone = "good" | "warn" | "bad" | "unk";

export interface VerdictStyle {
  label: string;
  tone: VerdictTone;
  icon: LucideIcon;
  /** Tailwind classes for a tinted pill (AA-verified tokens). */
  pill: string;
  /** Dot/marker colour class. */
  dot: string;
  tooltip: string;
}

const TONE_PILL: Record<VerdictTone, string> = {
  good: "bg-good-bg text-good border-good-bd",
  warn: "bg-warn-bg text-warn border-warn-bd",
  bad: "bg-bad-bg text-bad border-bad-bd",
  unk: "bg-unk-bg text-unk border-unk-bd",
};

const TONE_DOT: Record<VerdictTone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  unk: "bg-unk",
};

function make(
  label: string,
  tone: VerdictTone,
  icon: LucideIcon,
  tooltip: string,
): VerdictStyle {
  return { label, tone, icon, pill: TONE_PILL[tone], dot: TONE_DOT[tone], tooltip };
}

// Authenticity axis — "does it exist & apply?"
export const AUTHENTICITY: Record<AuthenticityVerdict, VerdictStyle> = {
  FABRICATED: make(
    "Fabricated",
    "bad",
    XCircle,
    "Citation not found in the corpus. Asserted by deterministic lookup, never by an LLM.",
  ),
  MISAPPLIED: make(
    "Misapplied",
    "warn",
    AlertTriangle,
    "The authority exists, but the proposition advanced is broader or different from its ratio.",
  ),
  VERIFIED: make(
    "Verified",
    "good",
    CheckCircle2,
    "The authority exists and the proposition is faithfully stated.",
  ),
};

// Good-law axis — "still good law? overruled / distinguished"
export const GOOD_LAW: Record<GoodLawVerdict, VerdictStyle> = {
  OVERRULED: make(
    "Overruled",
    "bad",
    XCircle,
    "A later binding decision has departed from this authority.",
  ),
  DISTINGUISHED: make(
    "Distinguished",
    "warn",
    AlertTriangle,
    "A later court limited this authority to its facts; check whether it still applies to yours.",
  ),
  GOOD_LAW: make(
    "Good law",
    "good",
    CheckCircle2,
    "No adverse treatment found in the corpus.",
  ),
  UNAVAILABLE: make(
    "Not checked",
    "unk",
    Info,
    "The good-law layer could not be reached. Not checked is not the same as passed.",
  ),
  NOT_CHECKED: make(
    "Not checked",
    "unk",
    Info,
    "Not checked is not the same as passed.",
  ),
};

export function goodLawStyle(verdict: GoodLawVerdict, source: string): VerdictStyle {
  if (source === "not_applicable") {
    return { ...GOOD_LAW.NOT_CHECKED, label: "N/A · statute" };
  }
  return GOOD_LAW[verdict];
}

export type ConfidenceBand = "high" | "moderate" | "low";

export function confidenceBand(value: number): {
  band: ConfidenceBand;
  tone: VerdictTone;
  label: string;
  note: string;
} {
  if (value >= 0.85)
    return {
      band: "high",
      tone: "good",
      label: "High",
      note: "High confidence.",
    };
  if (value >= 0.6)
    return {
      band: "moderate",
      tone: "warn",
      label: "Moderate",
      note: "Review before relying.",
    };
  return {
    band: "low",
    tone: "bad",
    label: "Low",
    note: "Treat as a prompt to check manually.",
  };
}