// Calculator inputs — the single source of truth for the sliders AND the only
// surface the LLM is allowed to write to. The model proposes INPUTS; the
// deterministic engine computes every OUTPUT. Inputs are in slider units
// (percentages as 0..100) plus the capacity tier the firm is deploying at.
import { z } from "zod";
import type { CalculatorInputs, CapacityTierId, NumericBound } from "./types";

export const CAPACITY_TIER_IDS: readonly CapacityTierId[] = ["pilot", "practice", "division", "firmwide"];

// Min/max/step mirror the <Field> sliders in pricing.tsx — clamping here keeps
// any LLM-proposed value inside exactly the same envelope a human could pick.
export const INPUT_BOUNDS = {
  seats: { min: 1, max: 2643, step: 1, label: "Lawyers", unit: "lawyers" },
  filingsPerMonth: { min: 1, max: 120, step: 1, label: "Filings per month", unit: "filings/mo" },
  hoursPerFiling: { min: 0.5, max: 8, step: 0.5, label: "Hours checking citations per filing", unit: "h" },
  blendedRate: { min: 40, max: 600, step: 10, label: "Blended hourly rate", unit: "£/h" },
  automationPct: { min: 20, max: 100, step: 5, label: "Honesty knob: time TraceIt removes", unit: "%" },
  valueRealizationPct: { min: 0, max: 100, step: 5, label: "Realization: saved hours that turn into £", unit: "%" },
} as const satisfies Record<string, NumericBound>;

export type NumericInputKey = keyof typeof INPUT_BOUNDS;

export const DEFAULT_INPUTS: CalculatorInputs = {
  capacityTier: "division",
  seats: 793,
  filingsPerMonth: 2,
  hoursPerFiling: 1.5,
  blendedRate: 600,
  automationPct: 50,
  valueRealizationPct: 30,
};

// Snap to the slider step, then clamp to [min, max]. Rounds away float dust.
function snapClamp(value: number, b: NumericBound): number {
  if (!Number.isFinite(value)) return b.min;
  const snapped = Math.round(value / b.step) * b.step;
  const clamped = Math.min(b.max, Math.max(b.min, snapped));
  return Math.round(clamped * 100) / 100;
}

/** Force every numeric field into the slider envelope; capacity tier passes through. */
export function clampInputs(i: CalculatorInputs): CalculatorInputs {
  return {
    capacityTier: i.capacityTier,
    seats: snapClamp(i.seats, INPUT_BOUNDS.seats),
    filingsPerMonth: snapClamp(i.filingsPerMonth, INPUT_BOUNDS.filingsPerMonth),
    hoursPerFiling: snapClamp(i.hoursPerFiling, INPUT_BOUNDS.hoursPerFiling),
    blendedRate: snapClamp(i.blendedRate, INPUT_BOUNDS.blendedRate),
    automationPct: snapClamp(i.automationPct, INPUT_BOUNDS.automationPct),
    valueRealizationPct: snapClamp(i.valueRealizationPct, INPUT_BOUNDS.valueRealizationPct),
  };
}

// What the LLM may set. Every field optional; unknown keys are stripped by zod;
// numbers are coerced so "200" works. Bad values fail validation → no apply.
export const CalculatorActionSchema = z
  .object({
    capacityTier: z.enum(["pilot", "practice", "division", "firmwide"]).optional(),
    seats: z.coerce.number().optional(),
    filingsPerMonth: z.coerce.number().optional(),
    hoursPerFiling: z.coerce.number().optional(),
    blendedRate: z.coerce.number().optional(),
    automationPct: z.coerce.number().optional(),
    valueRealizationPct: z.coerce.number().optional(),
  })
  .strip();

export type CalculatorAction = z.infer<typeof CalculatorActionSchema>;

/** Merge a validated partial action over current inputs and clamp the result. */
export function applyAction(current: CalculatorInputs, action: CalculatorAction): CalculatorInputs {
  return clampInputs({ ...current, ...action });
}

export interface ParsedReply {
  text: string; // reply with the action block removed
  action: CalculatorAction | null; // null when there's nothing valid to apply
}

const ACTION_FENCE = /```json\s*([\s\S]*?)```/gi;

/**
 * Pull a `{"action":"set_inputs","inputs":{...}}` block out of the model reply.
 * Uses the LAST valid block, strips it from the visible text, validates the
 * inputs, and returns null when there is no actionable change.
 */
export function parseInputsAction(reply: string): ParsedReply {
  let raw: string | null = null;
  let inputs: unknown = null;
  let m: RegExpExecArray | null;
  ACTION_FENCE.lastIndex = 0;
  while ((m = ACTION_FENCE.exec(reply)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && obj.action === "set_inputs" && obj.inputs && typeof obj.inputs === "object") {
        raw = m[0];
        inputs = obj.inputs;
      }
    } catch {
      // not JSON — ignore this fence
    }
  }
  if (raw === null) return { text: reply.trim(), action: null };

  const text = reply.replace(raw, "").replace(/\n{3,}/g, "\n\n").trim();
  const parsed = CalculatorActionSchema.safeParse(inputs);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return { text, action: null };
  }
  return { text, action: parsed.data };
}

/** Human-readable diff for the "applied" chip, e.g. "Lawyers 793 → 200". */
export function describeChanges(prev: CalculatorInputs, next: CalculatorInputs): string[] {
  const out: string[] = [];
  if (prev.capacityTier !== next.capacityTier) out.push(`Tier ${prev.capacityTier} → ${next.capacityTier}`);
  for (const key of Object.keys(INPUT_BOUNDS) as NumericInputKey[]) {
    if (prev[key] !== next[key]) {
      const b = INPUT_BOUNDS[key];
      out.push(`${b.label} ${prev[key]} → ${next[key]}`);
    }
  }
  return out;
}

/** Keys whose value changed — used to flash the matching sliders. */
export function changedKeys(prev: CalculatorInputs, next: CalculatorInputs): (keyof CalculatorInputs)[] {
  return (Object.keys(next) as (keyof CalculatorInputs)[]).filter((k) => prev[k] !== next[k]);
}
