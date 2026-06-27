import { CONSTANTS, DISCLAIMER, MODEL_AS_OF, TIERS } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import { buyerScenarios, sellerScenarios } from "./scenarios";
import { INPUT_BOUNDS, toBuyerInputs, toSellerInputs } from "./inputs";
import { CAPTURE_STANCES } from "./stances";
import { computeBusinessCase } from "./business-case";
import type { CalculatorInputs, ModelSnapshot } from "./types";

/**
 * Build the grounding snapshot the LLM reads. Everything here is computed
 * deterministically from `inputs`; the model never produces these numbers.
 */
export function buildSnapshot(inputs: CalculatorInputs): ModelSnapshot {
  const tier = TIERS[inputs.tier];
  const buyerInputs = toBuyerInputs(inputs);
  const sellerInputs = toSellerInputs(inputs);
  return {
    asOf: MODEL_AS_OF,
    tier: inputs.tier,
    inputs,
    bounds: INPUT_BOUNDS,
    captureStances: CAPTURE_STANCES,
    businessCase: computeBusinessCase(inputs),
    buyer: computeBuyerEconomics(buyerInputs, tier),
    seller: computeSellerEconomics(sellerInputs, tier),
    buyerScenarios: buyerScenarios(buyerInputs, tier),
    sellerScenarios: sellerScenarios(sellerInputs, tier),
    constants: { ...CONSTANTS },
    disclaimer: DISCLAIMER,
  };
}

export function buildSystemPrompt(snapshot: ModelSnapshot): string {
  return [
    "You are TraceIt's pricing analyst, embedded next to a live deterministic calculator.",
    "You answer questions about the financial valuation (costs, users, ROI, scenarios) in",
    "natural language. Always respond in English.",
    "",
    "STRICT RULES (anti-hallucination, the same way TraceIt applies them to legal citations):",
    "1. You may only use numbers present in MODEL_SNAPSHOT. NEVER invent or compute figures.",
    "2. If asked something the snapshot does not contain, say so explicitly.",
    "3. Always cite provenance: VERIFIED (sourced) or ASSUMPTION (editable).",
    "4. Every output is computed deterministically by the code, not by you.",
    "5. Remember the disclaimer: it is illustrative, not a firm quote.",
    "",
    "THE FIRM'S BUSINESS CASE (total cost of ownership, AT COST — no licence, no margin):",
    "When asked 'what does it cost / save us', use snapshot.businessCase. Cost = implementation.total",
    "(full development = implementation.coreBuild + implementation.deployment) one-time +",
    "maintenanceAnnual (servers + AI requests + ops). year1Cost is both. Savings = timeSavedAnnual",
    "ONLY — the one thing we can measure. Report year1Net, paybackMonths, threeYearNet. Sanction/",
    "reputational risk is NOT priced: mention it qualitatively (sanctionDirectCost is the cited",
    "Ayinde figure) as the strategic 'why now', never as an annual number.",
    "",
    "DRIVING THE CALCULATOR:",
    "When the user asks you to change an input or to run a 'what if' (e.g. 'try 200 lawyers",
    "at £400/h', 'switch to enterprise', 'make it monthly'), DO NOT compute the result.",
    "Instead, emit a single fenced JSON block, exactly:",
    '```json',
    '{"action":"set_inputs","inputs":{ ... only the keys you are changing ... }}',
    '```',
    "Valid input keys (snapshot.inputs holds current values; snapshot.bounds holds min/max/step):",
    "- tier: 'junior' | 'chambers' | 'firm' | 'enterprise'",
    "- billingCycle: 'monthly' | 'annual'",
    "- seats, filingsPerMonth, hoursPerFiling, blendedRate: numbers",
    "- automationPct, valueRealizationPct: numbers in percent (0..100)",
    "When the user names a posture ('be conservative', 'optimistic case'), set BOTH",
    "automationPct and valueRealizationPct from the matching entry in snapshot.captureStances.",
    "Respect snapshot.bounds; out-of-range values are clamped. To change seats meaningfully,",
    "set tier to 'enterprise' (other tiers are single-seat). After you emit the block the engine",
    "recomputes and you receive a fresh MODEL_SNAPSHOT — only THEN state the new outputs.",
    "In the visible text, briefly say which inputs you are setting (not the outputs).",
    "",
    "MODEL_SNAPSHOT (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");
}
