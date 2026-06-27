import type { Sourced, Tier, TierId } from "./types";

const AS_OF = "2026-06-27";

const V = (
  value: number,
  unit: string,
  source: string,
  note?: string,
): Sourced<number> => ({ value, unit, provenance: "VERIFICADO", source, asOf: AS_OF, editable: false, note });

const H = (
  value: number,
  unit: string,
  source: string,
  note?: string,
): Sourced<number> => ({ value, unit, provenance: "HIPOTESIS", source, asOf: AS_OF, editable: true, note });

export const MODEL_AS_OF = AS_OF;

export const DISCLAIMER =
  "Modelo ilustrativo/analítico, no una cotización en firme. TraceIt es apoyo a la decisión, " +
  "no asesoría legal; el abogado firmante sigue siendo responsable de toda autoridad citada.";

export const CONSTANTS = {
  FX_USD_PER_GBP: H(1.27, "USD/£", "tasa aprox. 2025–2026 (re-verificar día del pitch)"),
  ANNUAL_FACTOR_SMB: H(0.8, "ratio", "política de descuento −20% para tiers SMB"),
  BILLABLE_HOURS_PER_LAWYER_YEAR: H(1800, "h/año", "objetivo típico BigLaw (deriva tarifa del RPL)"),
  DIRECT_WASTED_COSTS_PER_INCIDENT: V(
    13500,
    "GBP",
    "Ayinde v Haringey [2025] EWHC 1383 — £2k+IVA wasted costs/abogado + ~£7k costas cliente recortadas",
  ),
  REPUTATIONAL_EXPOSURE_PER_INCIDENT: H(
    0,
    "GBP",
    "exposición SRA/strike-out/seguro PII (cualitativa; sube si se cuantifica)",
  ),
  // Resolución de la contradicción 0.43 vs 1/6: TRES cifras Stanford distintas y citadas.
  LEGAL_RAG_HALLUCINATION_RATE: V(
    0.17,
    "ratio",
    "Magesh et al., Stanford RegLab 2024 — Lexis+ AI (~1 de cada 6)",
  ),
  WESTLAW_AI_HALLUCINATION_RATE: V(
    0.34,
    "ratio",
    "Magesh et al., Stanford RegLab 2024 — Westlaw AI (~1 de cada 3)",
  ),
  GENERAL_LLM_HALLUCINATION_RATE: V(
    0.58,
    "ratio",
    "Dahl et al., Stanford RegLab 2024, 'Large Legal Fictions' (arXiv:2401.01301) — LLM general en derecho (58–82%)",
  ),
  LLM_COST_PER_SCAN: H(0.08, "GBP/scan", "Anthropic Claude Haiku pricing × ~tokens por filing"),
  API_COST_PER_SCAN: V(0, "GBP/scan", "legislation.gov.uk es API pública gratuita"),
  FIXED_PLATFORM_MONTHLY: H(70, "GBP/mes", "Neo4j Aura ~£50 + Railway ~£15 + dominio ~£5 (Cloudflare Pages £0)"),
  CITATIONS_PER_FILING: H(15, "citas/filing", "estimación interna para EV de riesgo"),
  P_REACHES_COURT: H(0.05, "ratio", "prob. de que una cita fabricada no detectada llegue a corte (estimación)"),
  WC_TOTAL_LAWYERS: V(2643, "abogados", "White & Case FY2025 — Global Legal Post"),
  WC_DISPUTES_SHARE: H(0.3, "ratio", "subconjunto disputas/arbitraje (nº1 GAR; ~60 en París) — rango 0.20–0.30"),
  WC_DISPUTES_LAWYERS: H(793, "abogados", "= round(WC_TOTAL_LAWYERS × WC_DISPUTES_SHARE)"),
  WC_RPL_USD: V(1400000, "USD", "White & Case RPL FY2025 — Global Legal Post"),
  WC_BLENDED_RATE_GBP: H(600, "GBP/h", "RPL/horas/FX ≈ £612/h, redondeado a £600 (conservador)"),
} as const satisfies Record<string, Sourced<number>>;

export type Constants = typeof CONSTANTS;

const junior: Tier = {
  id: "junior",
  name: "Junior advocate",
  forWho: "One barrister checking their own filings.",
  priceMonthly: V(49, "GBP/mes", "precio del equipo (página de pricing)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(20, "scans/mes", "tope del plan"),
  scanCapacityPerSeat: null,
  implementationCost: H(0, "GBP", "self-serve"),
  cac: H(400, "GBP", "adquisición self-serve + marketing"),
  monthlyChurn: H(0.03, "ratio", "SaaS SMB típico (~30%/año)"),
  supportMonthly: H(0, "GBP/mes", "self-serve"),
};

const chambers: Tier = {
  id: "chambers",
  name: "Chambers",
  forWho: "A set sharing review standards across counsel.",
  priceMonthly: V(290, "GBP/mes", "precio del equipo (página de pricing)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(200, "scans/mes", "tope del plan"),
  scanCapacityPerSeat: null,
  implementationCost: H(0, "GBP", "self-serve"),
  cac: H(400, "GBP", "adquisición self-serve + marketing"),
  monthlyChurn: H(0.03, "ratio", "SaaS SMB típico"),
  supportMonthly: H(0, "GBP/mes", "self-serve"),
  featured: true,
};

const firm: Tier = {
  id: "firm",
  name: "Firm / scale",
  forWho: "Litigation teams filing at volume.",
  priceMonthly: V(950, "GBP/mes", "precio del equipo (página de pricing)"),
  pricePerSeatMonthly: null,
  annualFactor: CONSTANTS.ANNUAL_FACTOR_SMB,
  scanCapacity: H(2000, "scans/mes", "fair-use honesto para 'ilimitado'"),
  scanCapacityPerSeat: null,
  implementationCost: H(500, "GBP", "onboarding/SSO"),
  cac: H(1500, "GBP", "venta asistida ligera"),
  monthlyChurn: H(0.02, "ratio", "más pegajoso que SMB puro"),
  supportMonthly: H(200, "GBP/mes", "soporte compartido"),
};

const enterprise: Tier = {
  id: "enterprise",
  name: "Enterprise (global firm)",
  forWho: "Global firms — e.g. White & Case disputes/arbitration.",
  priceMonthly: null,
  pricePerSeatMonthly: H(
    100,
    "GBP/seat/mes",
    "anclado a competidores (Clearbrief $300, Lexis ~$200, vLex ~$79; Harvey ~$1,200 techo)",
  ),
  annualFactor: V(1, "ratio", "enterprise se factura anual neto"),
  scanCapacity: null,
  scanCapacityPerSeat: H(50, "scans/seat/mes", "fair-use por abogado"),
  implementationCost: H(5000, "GBP", "onboarding enterprise + SSO"),
  cac: H(40000, "GBP", "benchmark legaltech ~£5k × ~6–8 (ciclo BigLaw 6–9m, comité ~6.8 stakeholders); rango £5k–£60k"),
  monthlyChurn: H(0.005, "ratio", "~6%/año, enterprise pegajoso"),
  supportMonthly: H(2000, "GBP/mes", "CSM/account management dedicado"),
};

export const TIERS: Record<TierId, Tier> = { junior, chambers, firm, enterprise };
export const TIERS_LIST: Tier[] = [junior, chambers, firm, enterprise];
