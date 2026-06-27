import type { Sourced, Tier, TierId } from "./types";

const AS_OF = "2026-06-27";

const V = (
  value: number,
  unit: string,
  source: string,
  note?: string,
): Sourced<number> => ({ value, unit, provenance: "VERIFIED", source, asOf: AS_OF, editable: false, note });

const H = (
  value: number,
  unit: string,
  source: string,
  note?: string,
): Sourced<number> => ({ value, unit, provenance: "ASSUMPTION", source, asOf: AS_OF, editable: true, note });

export const MODEL_AS_OF = AS_OF;

export const DISCLAIMER =
  "Illustrative/analytical model, not a firm quote. TraceIt is decision support, " +
  "not legal advice; the signing lawyer remains responsible for every authority cited.";

export const CONSTANTS = {
  FX_USD_PER_GBP: H(1.27, "USD/£", "approx. 2025–2026 rate (re-verify on pitch day)"),
  ANNUAL_FACTOR_SMB: H(0.8, "ratio", "−20% discount policy for SMB tiers"),
  BILLABLE_HOURS_PER_LAWYER_YEAR: H(1800, "h/yr", "typical BigLaw target (derives rate from RPL)"),
  DIRECT_WASTED_COSTS_PER_INCIDENT: V(
    13500,
    "GBP",
    "Ayinde v Haringey [2025] EWHC 1383 — £2k+VAT wasted costs/lawyer + ~£7k client costs disallowed",
  ),
  REPUTATIONAL_EXPOSURE_PER_INCIDENT: H(
    0,
    "GBP",
    "SRA/strike-out/PII insurance exposure (qualitative; raise if quantified)",
  ),
  // Resolves the 0.43 vs 1-in-6 contradiction: THREE distinct, cited Stanford figures.
  LEGAL_RAG_HALLUCINATION_RATE: V(
    0.17,
    "ratio",
    "Magesh et al., Stanford RegLab 2024 — Lexis+ AI (~1 in 6)",
  ),
  WESTLAW_AI_HALLUCINATION_RATE: V(
    0.34,
    "ratio",
    "Magesh et al., Stanford RegLab 2024 — Westlaw AI (~1 in 3)",
  ),
  GENERAL_LLM_HALLUCINATION_RATE: V(
    0.58,
    "ratio",
    "Dahl et al., Stanford RegLab 2024, 'Large Legal Fictions' (arXiv:2401.01301) — general-purpose LLM on legal queries (58–82%)",
  ),
  LLM_COST_PER_SCAN: H(0.08, "GBP/scan", "Anthropic Claude Haiku pricing × ~tokens per filing"),
  API_COST_PER_SCAN: V(0, "GBP/scan", "legislation.gov.uk is a free public API"),
  FIXED_PLATFORM_MONTHLY: H(70, "GBP/mo", "Neo4j Aura ~£50 + Railway ~£15 + domain ~£5 (Cloudflare Pages £0)"),
  CITATIONS_PER_FILING: H(15, "citations/filing", "internal estimate for risk EV"),
  P_REACHES_COURT: H(0.05, "ratio", "prob. that an undetected fabricated citation reaches court (estimate)"),
  WC_TOTAL_LAWYERS: V(2643, "lawyers", "White & Case FY2025 — Global Legal Post"),
  WC_DISPUTES_SHARE: H(0.3, "ratio", "disputes/arbitration subset (no. 1 GAR; ~60 in Paris) — range 0.20–0.30"),
  WC_DISPUTES_LAWYERS: H(793, "lawyers", "= round(WC_TOTAL_LAWYERS × WC_DISPUTES_SHARE)"),
  WC_RPL_USD: V(1400000, "USD", "White & Case RPL FY2025 — Global Legal Post"),
  WC_BLENDED_RATE_GBP: H(600, "GBP/h", "RPL/hours/FX ≈ £612/h, rounded to £600 (conservative)"),
} as const satisfies Record<string, Sourced<number>>;

export type Constants = typeof CONSTANTS;

const junior: Tier = {
  id: "junior",
  name: "Junior advocate",
  forWho: "One barrister checking their own filings.",
  priceMonthly: V(49, "GBP/mo", "team's price (pricing page)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(20, "scans/mo", "plan cap"),
  scanCapacityPerSeat: null,
  implementationCost: H(0, "GBP", "self-serve"),
  cac: H(400, "GBP", "self-serve acquisition + marketing"),
  monthlyChurn: H(0.03, "ratio", "typical SMB SaaS (~30%/yr)"),
  supportMonthly: H(0, "GBP/mo", "self-serve"),
};

const chambers: Tier = {
  id: "chambers",
  name: "Chambers",
  forWho: "A set sharing review standards across counsel.",
  priceMonthly: V(290, "GBP/mo", "team's price (pricing page)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(200, "scans/mo", "plan cap"),
  scanCapacityPerSeat: null,
  implementationCost: H(0, "GBP", "self-serve"),
  cac: H(400, "GBP", "self-serve acquisition + marketing"),
  monthlyChurn: H(0.03, "ratio", "typical SMB SaaS"),
  supportMonthly: H(0, "GBP/mo", "self-serve"),
  featured: true,
};

const firm: Tier = {
  id: "firm",
  name: "Firm / scale",
  forWho: "Litigation teams filing at volume.",
  priceMonthly: V(950, "GBP/mo", "team's price (pricing page)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(2000, "scans/mo", "honest fair-use cap for 'unlimited'"),
  scanCapacityPerSeat: null,
  implementationCost: H(500, "GBP", "onboarding/SSO"),
  cac: H(1500, "GBP", "light assisted sales"),
  monthlyChurn: H(0.02, "ratio", "stickier than pure SMB"),
  supportMonthly: H(200, "GBP/mo", "shared support"),
};

const enterprise: Tier = {
  id: "enterprise",
  name: "Enterprise (global firm)",
  forWho: "Global firms — e.g. White & Case disputes/arbitration.",
  priceMonthly: null,
  pricePerSeatMonthly: H(
    100,
    "GBP/seat/mo",
    "anchored to competitors (Clearbrief $300, Lexis ~$200, vLex ~$79; Harvey ~$1,200 ceiling)",
  ),
  annualFactor: V(1, "ratio", "enterprise is billed annually, net"),
  scanCapacity: null,
  scanCapacityPerSeat: H(50, "scans/seat/mo", "fair-use per lawyer"),
  implementationCost: H(5000, "GBP", "enterprise onboarding + SSO"),
  cac: H(40000, "GBP", "legaltech benchmark ~£5k × ~6–8 (BigLaw cycle 6–9mo, ~6.8-stakeholder committee); range £5k–£60k"),
  monthlyChurn: H(0.005, "ratio", "~6%/yr, sticky enterprise"),
  supportMonthly: H(2000, "GBP/mo", "dedicated CSM/account management"),
};

export const TIERS: Record<TierId, Tier> = { junior, chambers, firm, enterprise };
export const TIERS_LIST: Tier[] = [junior, chambers, firm, enterprise];
