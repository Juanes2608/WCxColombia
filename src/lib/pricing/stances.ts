// "Time captured" stances. Instead of asking a firm to guess two subjective
// percentages, they pick a documented posture; each stance sets BOTH the
// automation knob (how much review time is removed) and the realization knob
// (how much of that time becomes billed money). The sliders remain available as
// an advanced override. Realistic == the model's base-case defaults, so every
// W&C figure in the pitch stays unchanged.
import type { CaptureStance } from "./types";

export const CAPTURE_STANCES: CaptureStance[] = [
  {
    id: "conservative",
    label: "Conservative",
    automationPct: 50,
    valueRealizationPct: 30,
    note: "Under-promise: half the manual check time removed, only a third re-billed.",
  },
  {
    id: "realistic",
    label: "Realistic",
    automationPct: 65,
    valueRealizationPct: 50,
    note: "Base case: most checks automated, half the freed hours re-billed.",
  },
  {
    id: "optimistic",
    label: "Optimistic",
    automationPct: 80,
    valueRealizationPct: 70,
    note: "High adoption: most check time removed and most freed hours re-billed.",
  },
];

export type CaptureStanceId = CaptureStance["id"] | "custom";

/** Fraction of raw "hours × rate" that the model counts as real money. */
export function effectiveCapturePct(automationPct: number, valueRealizationPct: number): number {
  return (automationPct / 100) * (valueRealizationPct / 100);
}

/** Which named stance the current knobs correspond to, or "custom" if neither. */
export function matchStance(automationPct: number, valueRealizationPct: number): CaptureStanceId {
  const hit = CAPTURE_STANCES.find(
    (s) => s.automationPct === automationPct && s.valueRealizationPct === valueRealizationPct,
  );
  return hit ? hit.id : "custom";
}
