# TraceIt Pricing Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, auditable pricing engine (single source of truth) that powers TraceIt's pricing page with dual-lens unit economics (buyer ROI + seller viability), anchored on White & Case, plus a grounded LLM chatbot.

**Architecture:** Pure-TypeScript engine in `src/lib/pricing/` — typed `Sourced<T>` constants, pure functions, vitest tests with a hand-verified master example. The page consumes the engine (no inline math). The chatbot sends the engine's computed `ModelSnapshot` to a FastAPI proxy (Anthropic key server-side only) that may not invent numbers.

**Tech Stack:** TypeScript, TanStack Start (React 19), Vitest (new), Zod (already present), Anthropic Messages API (backend, separate `main` branch — contract only here).

**Spec:** `docs/superpowers/specs/2026-06-27-traceit-pricing-engine-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config (node env, `@/` alias) — **new** |
| `src/lib/pricing/types.ts` | All engine types (`Sourced`, `Tier`, inputs, economics, snapshot) |
| `src/lib/pricing/format.ts` | Deterministic GBP / % / ratio / months formatting |
| `src/lib/pricing/constants.ts` | Every constant as `Sourced<T>` + `TIERS` + presets |
| `src/lib/pricing/seller.ts` | `computeSellerEconomics` + helpers |
| `src/lib/pricing/buyer.ts` | `computeBuyerEconomics` + risk EV |
| `src/lib/pricing/scenarios.ts` | conservative / base / optimistic generators |
| `src/lib/pricing/chat-context.ts` | `buildChatContext` (snapshot) + `buildSystemPrompt` |
| `src/lib/pricing/index.ts` | Public API + `computeModel` convenience |
| `src/lib/pricing/__tests__/*.test.ts` | Master example, edges, coherence, provenance |
| `src/lib/chat-client.ts` | Frontend POST to `/api/chat` — **new** |
| `src/components/citationguard/ChatPanel.tsx` | Minimal grounded chat widget — **new** |
| `src/routes/pricing.tsx` | **Modify** — consume engine, add enterprise tier + W&C preset, mount chat |
| `docs/superpowers/specs/2026-06-27-api-chat-contract.md` | Backend `/api/chat` contract — **new** |

---

## Task 1: Test tooling (Vitest)

**Files:**
- Modify: `package.json` (add devDependency + script)
- Create: `vitest.config.ts`
- Create: `src/lib/pricing/__tests__/smoke.test.ts`

- [ ] **Step 1: Install vitest as a dev dependency**

Run: `npm install -D vitest@^2.1.8`
Expected: `package.json` gains `"vitest"` under `devDependencies`; no lockfile is committed (repo policy: Cloudflare runs `npm install`).

- [ ] **Step 2: Add the `test` script to package.json**

In `package.json`, under `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/pricing/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm run test`
Expected: PASS (1 test). Confirms vitest + `@/` alias plugin load.

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts src/lib/pricing/__tests__/smoke.test.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Engine types

**Files:**
- Create: `src/lib/pricing/types.ts`

No test (pure type declarations; compilation is the check — downstream tasks exercise them).

- [ ] **Step 1: Create `src/lib/pricing/types.ts`**

```ts
// TraceIt pricing engine — types (single source of truth).
// Every figure that reaches the UI is computed from these shapes.

export type Provenance = "VERIFICADO" | "HIPOTESIS";

/** A constant that carries its own provenance so the UI/chatbot can label it. */
export interface Sourced<T> {
  value: T;
  unit: string; // "GBP/mes", "scans/mes", "ratio", "%", "USD"
  provenance: Provenance;
  source: string; // citation+URL, or "estimación interna"
  asOf: string; // ISO date "2026-06-27"
  editable: boolean; // true for adjustable HIPOTESIS
  note?: string;
}

export type TierId = "junior" | "chambers" | "firm" | "enterprise";
export type BillingCycle = "monthly" | "annual";

export interface Tier {
  id: TierId;
  name: string;
  forWho: string;
  priceMonthly: Sourced<number> | null; // SMB tiers
  pricePerSeatMonthly: Sourced<number> | null; // enterprise
  annualFactor: Sourced<number>; // 1.0 for enterprise (already net)
  scanCapacity: Sourced<number> | null; // absolute cap (SMB)
  scanCapacityPerSeat: Sourced<number> | null; // per-seat cap (enterprise)
  implementationCost: Sourced<number>;
  cac: Sourced<number>;
  monthlyChurn: Sourced<number>;
  supportMonthly: Sourced<number>;
  featured?: boolean;
}

export interface BuyerInputs {
  tierId: TierId;
  seats: number; // SMB: 1; enterprise: lawyers using the tool
  filingsPerSeatMonth: number;
  hoursPerFiling: number;
  blendedRate: number; // £/h
  automationPct: number; // 0..1 honesty knob
  valueRealizationPct: number; // 0..1 saved hours that become £
  includeRiskEV: boolean;
  billingCycle: BillingCycle;
}

export interface SellerInputs {
  tierId: TierId;
  seats: number;
  scansPerSeatMonth: number;
  billingCycle: BillingCycle;
}

export interface BuyerPerSeat {
  valueMonthly: number; // realized
  costMonthly: number;
  roiPct: number | null;
}

export interface BuyerEconomics {
  effectiveLicenseMonthly: number;
  valuePerFiling: number;
  hoursSavedMonthly: number;
  timeValueMonthly: number;
  realizedTimeValueMonthly: number;
  riskEVMonthly: number;
  netBenefitMonthly: number;
  buyerRoiPct: number | null; // null if license 0
  buyerBreakEvenFilings: number; // Infinity if value/filing <= 0
  perSeat: BuyerPerSeat;
  uncertainty: string[];
}

export type DominantCost = "infra" | "llm" | "support" | "cac";

export interface SellerEconomics {
  revenueMonthly: number;
  variableCostPerScan: number;
  scansMonthly: number; // after capacity clamp
  capacityClamped: boolean;
  variableCostMonthly: number;
  costToServeMonthly: number;
  contributionMonthly: number;
  grossMarginPct: number; // 0 if revenue 0
  productGrossMarginPct: number; // ex-support
  companyBreakEvenCustomers: number; // Infinity if contribution <= 0
  cacPaybackMonths: number | null; // null if contribution <= 0
  ltv: number | null; // Infinity if churn 0 (flagged)
  ltvCacRatio: number | null;
  meetsLtvCacTarget: boolean; // >= 3
  minViableSeats: number; // seats for LTV/CAC >= 3 (mid-market floor); Infinity if N/A
  dominantCost: DominantCost;
  uncertainty: string[];
}

export interface ScenarioSet<T> {
  conservative: T;
  base: T;
  optimistic: T;
}

export interface ModelSnapshot {
  asOf: string;
  tier: TierId;
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
  constants: Record<string, Sourced<number>>;
  disclaimer: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing/types.ts
git commit -m "feat(pricing): engine types"
```

---

## Task 3: Formatting helpers

**Files:**
- Create: `src/lib/pricing/format.ts`
- Test: `src/lib/pricing/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatGBP, formatPct, formatRatio, formatMonths } from "@/lib/pricing/format";

describe("format", () => {
  it("formats GBP with no decimals", () => {
    expect(formatGBP(79300)).toBe("£79,300");
    expect(formatGBP(0)).toBe("£0");
  });
  it("formats percentages", () => {
    expect(formatPct(0.9724)).toBe("97.2%");
    expect(formatPct(0)).toBe("0.0%");
  });
  it("formats ratios and Infinity", () => {
    expect(formatRatio(128.5)).toBe("128.5×");
    expect(formatRatio(Infinity)).toBe("∞");
  });
  it("formats months and null", () => {
    expect(formatMonths(1.56)).toBe("1.6 meses");
    expect(formatMonths(null)).toBe("aún no");
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npm run test -- format`
Expected: FAIL (cannot find module `format`).

- [ ] **Step 3: Implement `src/lib/pricing/format.ts`**

```ts
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- format`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/format.ts src/lib/pricing/__tests__/format.test.ts
git commit -m "feat(pricing): deterministic formatting helpers"
```

---

## Task 4: Constants (provenance-labeled)

**Files:**
- Create: `src/lib/pricing/constants.ts`
- Test: `src/lib/pricing/__tests__/provenance.test.ts`

- [ ] **Step 1: Write the failing provenance test**

```ts
import { describe, it, expect } from "vitest";
import { CONSTANTS, TIERS_LIST } from "@/lib/pricing/constants";
import type { Sourced } from "@/lib/pricing/types";

const allSourced = (): Sourced<number>[] => {
  const fromConsts = Object.values(CONSTANTS);
  const fromTiers = TIERS_LIST.flatMap((t) =>
    [
      t.priceMonthly,
      t.pricePerSeatMonthly,
      t.annualFactor,
      t.scanCapacity,
      t.scanCapacityPerSeat,
      t.implementationCost,
      t.cac,
      t.monthlyChurn,
      t.supportMonthly,
    ].filter((s): s is Sourced<number> => s !== null),
  );
  return [...fromConsts, ...fromTiers];
};

describe("provenance", () => {
  it("every VERIFICADO constant has a non-empty source", () => {
    for (const s of allSourced()) {
      if (s.provenance === "VERIFICADO") {
        expect(s.source.length, `source for ${s.unit}/${s.value}`).toBeGreaterThan(0);
      }
    }
  });
  it("every HIPOTESIS constant is editable", () => {
    for (const s of allSourced()) {
      if (s.provenance === "HIPOTESIS") {
        expect(s.editable, `editable for ${s.unit}/${s.value}`).toBe(true);
      }
    }
  });
  it("every constant has an asOf date", () => {
    for (const s of allSourced()) {
      expect(s.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
```

- [ ] **Step 2: Run it (fails — module missing)**

Run: `npm run test -- provenance`
Expected: FAIL (cannot find module `constants`).

- [ ] **Step 3: Implement `src/lib/pricing/constants.ts`**

```ts
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
    "anclado a competidores (CoCounsel ~$225, Lexis ~$200, vLex ~$79; Harvey ~$1,200 techo)",
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- provenance`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/constants.ts src/lib/pricing/__tests__/provenance.test.ts
git commit -m "feat(pricing): provenance-labeled constants and tiers"
```

---

## Task 5: Seller economics (master example + edges)

**Files:**
- Create: `src/lib/pricing/seller.ts`
- Test: `src/lib/pricing/__tests__/seller.test.ts`

- [ ] **Step 1: Write the failing test (master example + edge cases)**

```ts
import { describe, it, expect } from "vitest";
import { computeSellerEconomics, effectiveLicenseMonthly, tierCapacity } from "@/lib/pricing/seller";
import { TIERS } from "@/lib/pricing/constants";
import type { SellerInputs } from "@/lib/pricing/types";

const wc: SellerInputs = {
  tierId: "enterprise",
  seats: 793,
  scansPerSeatMonth: 3,
  billingCycle: "annual",
};

describe("seller — White & Case master example", () => {
  const s = computeSellerEconomics(wc, TIERS.enterprise);
  it("revenue = 793 × £100 = £79,300", () => expect(s.revenueMonthly).toBe(79300));
  it("scans = 2,379 (no clamp)", () => {
    expect(s.scansMonthly).toBe(2379);
    expect(s.capacityClamped).toBe(false);
  });
  it("variable cost = £190.32", () => expect(s.variableCostMonthly).toBeCloseTo(190.32, 2));
  it("contribution = £77,109.68", () => expect(s.contributionMonthly).toBeCloseTo(77109.68, 2));
  it("gross margin ≈ 97.24%", () => expect(s.grossMarginPct).toBeCloseTo(0.9724, 4));
  it("product gross margin ≈ 99.76%", () => expect(s.productGrossMarginPct).toBeCloseTo(0.9976, 4));
  it("CAC payback ≈ 0.52 months", () => expect(s.cacPaybackMonths!).toBeCloseTo(0.519, 2));
  it("LTV = £15,421,936", () => expect(s.ltv!).toBeCloseTo(15421936, 0));
  it("LTV/CAC ≈ 385.5 and meets target", () => {
    expect(s.ltvCacRatio!).toBeCloseTo(385.5, 1);
    expect(s.meetsLtvCacTarget).toBe(true);
  });
  it("minViableSeats = 27 (mid-market floor)", () => expect(s.minViableSeats).toBe(27));
  it("dominant ongoing cost is support", () => expect(s.dominantCost).toBe("support"));
});

describe("seller — edge cases", () => {
  it("contribution <= 0 → break-even Infinity and payback null", () => {
    const broke = computeSellerEconomics(
      { ...wc, seats: 1, scansPerSeatMonth: 3 },
      { ...TIERS.enterprise, supportMonthly: { ...TIERS.enterprise.supportMonthly, value: 5000 } },
    );
    expect(broke.contributionMonthly).toBeLessThanOrEqual(0);
    expect(broke.companyBreakEvenCustomers).toBe(Infinity);
    expect(broke.cacPaybackMonths).toBeNull();
  });
  it("revenue 0 → gross margin 0", () => {
    const zero = computeSellerEconomics({ ...wc, seats: 0 }, TIERS.enterprise);
    expect(zero.revenueMonthly).toBe(0);
    expect(zero.grossMarginPct).toBe(0);
  });
  it("usage over capacity is clamped (junior cap 20)", () => {
    const j = computeSellerEconomics(
      { tierId: "junior", seats: 1, scansPerSeatMonth: 50, billingCycle: "monthly" },
      TIERS.junior,
    );
    expect(j.scansMonthly).toBe(20);
    expect(j.capacityClamped).toBe(true);
  });
  it("churn 0 → LTV Infinity, flagged", () => {
    const noChurn = computeSellerEconomics(wc, {
      ...TIERS.enterprise,
      monthlyChurn: { ...TIERS.enterprise.monthlyChurn, value: 0 },
    });
    expect(noChurn.ltv).toBe(Infinity);
    expect(noChurn.uncertainty.join(" ")).toMatch(/churn/i);
  });
});

describe("seller — helpers", () => {
  it("enterprise license = seats × price (no annual factor)", () => {
    expect(effectiveLicenseMonthly(TIERS.enterprise, 793, "annual")).toBe(79300);
  });
  it("SMB annual license applies factor", () => {
    expect(effectiveLicenseMonthly(TIERS.chambers, 1, "annual")).toBeCloseTo(232, 5);
  });
  it("enterprise capacity = seats × perSeat", () => {
    expect(tierCapacity(TIERS.enterprise, 793)).toBe(39650);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- seller`
Expected: FAIL (cannot find module `seller`).

- [ ] **Step 3: Implement `src/lib/pricing/seller.ts`**

```ts
import { CONSTANTS, type Constants } from "./constants";
import type { BillingCycle, DominantCost, SellerEconomics, SellerInputs, Tier } from "./types";

export function effectiveLicenseMonthly(tier: Tier, seats: number, cycle: BillingCycle): number {
  if (tier.pricePerSeatMonthly) {
    return seats * tier.pricePerSeatMonthly.value; // enterprise: annual factor = 1
  }
  if (tier.priceMonthly) {
    const factor = cycle === "annual" ? tier.annualFactor.value : 1;
    return tier.priceMonthly.value * factor;
  }
  return 0;
}

export function tierCapacity(tier: Tier, seats: number): number {
  if (tier.scanCapacity) return tier.scanCapacity.value;
  if (tier.scanCapacityPerSeat) return seats * tier.scanCapacityPerSeat.value;
  return Infinity;
}

export function computeSellerEconomics(
  inputs: SellerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): SellerEconomics {
  const uncertainty: string[] = [];

  const revenueMonthly = effectiveLicenseMonthly(tier, inputs.seats, inputs.billingCycle);
  const variableCostPerScan = c.LLM_COST_PER_SCAN.value + c.API_COST_PER_SCAN.value;

  const capacity = tierCapacity(tier, inputs.seats);
  const requestedScans = inputs.seats * inputs.scansPerSeatMonth;
  const scansMonthly = Math.min(requestedScans, capacity);
  const capacityClamped = requestedScans > capacity;
  if (capacityClamped) uncertainty.push("uso recortado al tope de capacidad del tier (clamp)");

  const variableCostMonthly = scansMonthly * variableCostPerScan;
  const supportMonthly = tier.supportMonthly.value;
  const costToServeMonthly = variableCostMonthly + supportMonthly;
  const contributionMonthly = revenueMonthly - costToServeMonthly;

  const grossMarginPct = revenueMonthly > 0 ? contributionMonthly / revenueMonthly : 0;
  const productGrossMarginPct =
    revenueMonthly > 0 ? (revenueMonthly - variableCostMonthly) / revenueMonthly : 0;

  const fixed = c.FIXED_PLATFORM_MONTHLY.value;
  const companyBreakEvenCustomers =
    contributionMonthly > 0 ? Math.ceil(fixed / contributionMonthly) : Infinity;

  const cac = tier.cac.value;
  const cacPaybackMonths = contributionMonthly > 0 ? cac / contributionMonthly : null;

  const churn = tier.monthlyChurn.value;
  let ltv: number | null;
  if (churn > 0) {
    ltv = contributionMonthly / churn;
  } else if (contributionMonthly > 0) {
    ltv = Infinity;
    uncertainty.push("churn = 0 → LTV infinito (hipótesis irreal, ajustar churn)");
  } else {
    ltv = null;
  }

  const ltvCacRatio =
    ltv === null || cac <= 0 ? null : ltv === Infinity ? Infinity : ltv / cac;
  const meetsLtvCacTarget = ltvCacRatio !== null && ltvCacRatio >= 3;

  // Cuello de botella real: comparar costos mensuales (CAC amortizado por vida ≈ 1/churn).
  const costs: Record<DominantCost, number> = {
    infra: fixed,
    llm: variableCostMonthly,
    support: supportMonthly,
    cac: cac * churn,
  };
  const dominantCost = (Object.keys(costs) as DominantCost[]).reduce((a, b) =>
    costs[a] >= costs[b] ? a : b,
  );

  // Asientos mínimos para LTV/CAC >= 3 (piso mid-market). Solo significativo para tiers por-asiento.
  const perSeatPrice = tier.pricePerSeatMonthly?.value ?? 0;
  const perSeatMarginal = perSeatPrice - inputs.scansPerSeatMonth * variableCostPerScan;
  const minViableSeats =
    perSeatMarginal > 0
      ? Math.ceil((3 * cac * churn + supportMonthly) / perSeatMarginal)
      : Infinity;

  for (const s of [tier.cac, tier.monthlyChurn, tier.supportMonthly, c.LLM_COST_PER_SCAN]) {
    if (s.provenance === "HIPOTESIS") uncertainty.push(`HIPÓTESIS: ${s.source}`);
  }

  return {
    revenueMonthly,
    variableCostPerScan,
    scansMonthly,
    capacityClamped,
    variableCostMonthly,
    costToServeMonthly,
    contributionMonthly,
    grossMarginPct,
    productGrossMarginPct,
    companyBreakEvenCustomers,
    cacPaybackMonths,
    ltv,
    ltvCacRatio,
    meetsLtvCacTarget,
    minViableSeats,
    dominantCost,
    uncertainty,
  };
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- seller`
Expected: PASS (all seller tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/seller.ts src/lib/pricing/__tests__/seller.test.ts
git commit -m "feat(pricing): seller unit economics with master example tests"
```

---

## Task 6: Buyer economics (master example + risk + edges)

**Files:**
- Create: `src/lib/pricing/buyer.ts`
- Test: `src/lib/pricing/__tests__/buyer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeBuyerEconomics } from "@/lib/pricing/buyer";
import { TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs } from "@/lib/pricing/types";

const wc: BuyerInputs = {
  tierId: "enterprise",
  seats: 793,
  filingsPerSeatMonth: 3,
  hoursPerFiling: 2.5,
  blendedRate: 600,
  automationPct: 0.65,
  valueRealizationPct: 0.5,
  includeRiskEV: false,
  billingCycle: "annual",
};

describe("buyer — White & Case master example", () => {
  const b = computeBuyerEconomics(wc, TIERS.enterprise);
  it("value per filing = £975", () => expect(b.valuePerFiling).toBeCloseTo(975, 5));
  it("hours saved = 3,865.875", () => expect(b.hoursSavedMonthly).toBeCloseTo(3865.875, 3));
  it("time value = £2,319,525", () => expect(b.timeValueMonthly).toBeCloseTo(2319525, 0));
  it("realized time value = £1,159,762.50", () =>
    expect(b.realizedTimeValueMonthly).toBeCloseTo(1159762.5, 2));
  it("effective license = £79,300", () => expect(b.effectiveLicenseMonthly).toBe(79300));
  it("net benefit = £1,080,462.50", () => expect(b.netBenefitMonthly).toBeCloseTo(1080462.5, 2));
  it("ROI ≈ 13.6×", () => expect(b.buyerRoiPct!).toBeCloseTo(13.625, 3));
  it("per-seat realized value £1,462.50 vs £100 cost", () => {
    expect(b.perSeat.valueMonthly).toBeCloseTo(1462.5, 2);
    expect(b.perSeat.costMonthly).toBeCloseTo(100, 5);
    expect(b.perSeat.roiPct!).toBeCloseTo(13.625, 3);
  });
});

describe("buyer — risk EV and edges", () => {
  it("risk EV adds a separate, positive expected value when enabled", () => {
    const withRisk = computeBuyerEconomics({ ...wc, includeRiskEV: true }, TIERS.enterprise);
    // seats 793 × filings 3 × cites 15 × 0.17 × 0.05 × £62,000
    expect(withRisk.riskEVMonthly).toBeCloseTo(793 * 3 * 15 * 0.17 * 0.05 * (13500 + 0), 0);
    expect(withRisk.netBenefitMonthly).toBeGreaterThan(
      computeBuyerEconomics(wc, TIERS.enterprise).netBenefitMonthly,
    );
  });
  it("license 0 → ROI null", () => {
    const free = computeBuyerEconomics({ ...wc, seats: 0 }, TIERS.enterprise);
    expect(free.effectiveLicenseMonthly).toBe(0);
    expect(free.buyerRoiPct).toBeNull();
  });
  it("value per filing <= 0 → break-even Infinity", () => {
    const noValue = computeBuyerEconomics({ ...wc, automationPct: 0 }, TIERS.enterprise);
    expect(noValue.buyerBreakEvenFilings).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- buyer`
Expected: FAIL (cannot find module `buyer`).

- [ ] **Step 3: Implement `src/lib/pricing/buyer.ts`**

```ts
import { CONSTANTS, type Constants } from "./constants";
import { effectiveLicenseMonthly } from "./seller";
import type { BuyerEconomics, BuyerInputs, Tier } from "./types";

export function computeBuyerEconomics(
  inputs: BuyerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): BuyerEconomics {
  const uncertainty: string[] = [];

  const effective = effectiveLicenseMonthly(tier, inputs.seats, inputs.billingCycle);
  const valuePerFiling = inputs.hoursPerFiling * inputs.automationPct * inputs.blendedRate;
  const hoursSavedMonthly =
    inputs.seats * inputs.filingsPerSeatMonth * inputs.hoursPerFiling * inputs.automationPct;
  const timeValueMonthly = hoursSavedMonthly * inputs.blendedRate;
  const realizedTimeValueMonthly = timeValueMonthly * inputs.valueRealizationPct;

  let riskEVMonthly = 0;
  if (inputs.includeRiskEV) {
    riskEVMonthly =
      inputs.seats *
      inputs.filingsPerSeatMonth *
      c.CITATIONS_PER_FILING.value *
      c.LEGAL_RAG_HALLUCINATION_RATE.value *
      c.P_REACHES_COURT.value *
      (c.DIRECT_WASTED_COSTS_PER_INCIDENT.value + c.REPUTATIONAL_EXPOSURE_PER_INCIDENT.value);
    uncertainty.push("riesgo EV: directo £13.5k (Ayinde, V) + reputacional editable (H); citas/filing y P(corte) son H");
  }

  const netBenefitMonthly = realizedTimeValueMonthly + riskEVMonthly - effective;
  const buyerRoiPct = effective > 0 ? netBenefitMonthly / effective : null;

  const valueContributionPerFiling = valuePerFiling * inputs.valueRealizationPct;
  const buyerBreakEvenFilings =
    valueContributionPerFiling > 0 ? Math.ceil(effective / valueContributionPerFiling) : Infinity;

  const seatDivisor = inputs.seats > 0 ? inputs.seats : 1;
  const perSeatCost = effective / seatDivisor;
  const perSeatValue = (realizedTimeValueMonthly + riskEVMonthly) / seatDivisor;
  const perSeatRoi = perSeatCost > 0 ? (perSeatValue - perSeatCost) / perSeatCost : null;

  uncertainty.push("valor de tiempo descontado por valueRealizationPct (horas → £ solo si se re-facturan)");

  return {
    effectiveLicenseMonthly: effective,
    valuePerFiling,
    hoursSavedMonthly,
    timeValueMonthly,
    realizedTimeValueMonthly,
    riskEVMonthly,
    netBenefitMonthly,
    buyerRoiPct,
    buyerBreakEvenFilings,
    perSeat: { valueMonthly: perSeatValue, costMonthly: perSeatCost, roiPct: perSeatRoi },
    uncertainty,
  };
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- buyer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/buyer.ts src/lib/pricing/__tests__/buyer.test.ts
git commit -m "feat(pricing): buyer ROI economics with master example tests"
```

---

## Task 7: Scenarios (coherence + clamp preserved)

**Files:**
- Create: `src/lib/pricing/scenarios.ts`
- Test: `src/lib/pricing/__tests__/scenarios.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buyerScenarios, sellerScenarios } from "@/lib/pricing/scenarios";
import { TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing/types";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

describe("scenarios", () => {
  it("buyer: optimistic net >= base >= conservative", () => {
    const sc = buyerScenarios(b, TIERS.enterprise);
    expect(sc.optimistic.netBenefitMonthly).toBeGreaterThanOrEqual(sc.base.netBenefitMonthly);
    expect(sc.base.netBenefitMonthly).toBeGreaterThanOrEqual(sc.conservative.netBenefitMonthly);
  });
  it("buyer: automation stays clamped within [0.20, 1.0]", () => {
    const hi: BuyerInputs = { ...b, automationPct: 0.9 };
    const sc = buyerScenarios(hi, TIERS.enterprise);
    // optimistic 0.9×1.4 = 1.26 → clamps to 1.0 → hoursSaved = seats×filings×hours×1.0
    expect(sc.optimistic.hoursSavedMonthly).toBeCloseTo(793 * 3 * 2.5 * 1.0, 3);
  });
  it("seller: conservative contribution <= base <= optimistic", () => {
    const sc = sellerScenarios(s, TIERS.enterprise);
    expect(sc.conservative.contributionMonthly).toBeLessThanOrEqual(sc.base.contributionMonthly);
    expect(sc.optimistic.contributionMonthly).toBeGreaterThanOrEqual(sc.base.contributionMonthly);
  });
  it("seller: coherence — contribution === revenue − costToServe in every scenario", () => {
    const sc = sellerScenarios(s, TIERS.enterprise);
    for (const k of ["conservative", "base", "optimistic"] as const) {
      const e = sc[k];
      expect(e.contributionMonthly).toBeCloseTo(e.revenueMonthly - e.costToServeMonthly, 6);
    }
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- scenarios`
Expected: FAIL (cannot find module `scenarios`).

- [ ] **Step 3: Implement `src/lib/pricing/scenarios.ts`**

```ts
import { CONSTANTS, type Constants } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import type { BuyerEconomics, BuyerInputs, ScenarioSet, SellerEconomics, SellerInputs, Tier } from "./types";

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Buyer: vary the most uncertain lever — automationPct (honesty knob). */
export function buyerScenarios(
  inputs: BuyerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): ScenarioSet<BuyerEconomics> {
  const mk = (mult: number): BuyerEconomics =>
    computeBuyerEconomics(
      { ...inputs, automationPct: clamp(inputs.automationPct * mult, 0.2, 1.0) },
      tier,
      c,
    );
  return { conservative: mk(0.6), base: mk(1.0), optimistic: mk(1.4) };
}

/** Seller: vary the two dominant levers — CAC × churn. */
export function sellerScenarios(
  inputs: SellerInputs,
  tier: Tier,
  c: Constants = CONSTANTS,
): ScenarioSet<SellerEconomics> {
  const mk = (cacMult: number, churnMult: number): SellerEconomics =>
    computeSellerEconomics(inputs, {
      ...tier,
      cac: { ...tier.cac, value: tier.cac.value * cacMult },
      monthlyChurn: { ...tier.monthlyChurn, value: tier.monthlyChurn.value * churnMult },
    }, c);
  return { conservative: mk(1.4, 2.0), base: mk(1.0, 1.0), optimistic: mk(0.7, 0.5) };
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- scenarios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/scenarios.ts src/lib/pricing/__tests__/scenarios.test.ts
git commit -m "feat(pricing): conservative/base/optimistic scenarios"
```

---

## Task 8: Public API + `computeModel`

**Files:**
- Create: `src/lib/pricing/index.ts`
- Test: `src/lib/pricing/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeModel, TIERS } from "@/lib/pricing";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

describe("computeModel", () => {
  it("bundles buyer + seller + scenarios for the tier", () => {
    const m = computeModel(b, s);
    expect(m.tier).toBe("enterprise");
    expect(m.buyer.effectiveLicenseMonthly).toBe(79300);
    expect(m.seller.revenueMonthly).toBe(79300);
    expect(m.buyerScenarios.base.netBenefitMonthly).toBeCloseTo(m.buyer.netBenefitMonthly, 6);
  });
  it("exposes TIERS", () => expect(TIERS.enterprise.id).toBe("enterprise"));
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- index`
Expected: FAIL (cannot find `computeModel`).

- [ ] **Step 3: Implement `src/lib/pricing/index.ts`**

```ts
export * from "./types";
export { CONSTANTS, TIERS, TIERS_LIST, MODEL_AS_OF, DISCLAIMER } from "./constants";
export { computeBuyerEconomics } from "./buyer";
export { computeSellerEconomics, effectiveLicenseMonthly, tierCapacity } from "./seller";
export { buyerScenarios, sellerScenarios } from "./scenarios";
export { buildChatContext, buildSystemPrompt } from "./chat-context";
export { formatGBP, formatPct, formatRatio, formatMonths } from "./format";

import { TIERS } from "./constants";
import { computeBuyerEconomics } from "./buyer";
import { computeSellerEconomics } from "./seller";
import { buyerScenarios, sellerScenarios } from "./scenarios";
import type {
  BuyerEconomics, BuyerInputs, ScenarioSet, SellerEconomics, SellerInputs,
} from "./types";

export interface Model {
  tier: BuyerInputs["tierId"];
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
}

export function computeModel(buyerInputs: BuyerInputs, sellerInputs: SellerInputs): Model {
  const tier = TIERS[buyerInputs.tierId];
  const sellerTier = TIERS[sellerInputs.tierId];
  return {
    tier: buyerInputs.tierId,
    buyer: computeBuyerEconomics(buyerInputs, tier),
    seller: computeSellerEconomics(sellerInputs, sellerTier),
    buyerScenarios: buyerScenarios(buyerInputs, tier),
    sellerScenarios: sellerScenarios(sellerInputs, sellerTier),
  };
}
```

> Note: `index.ts` re-exports `chat-context` (Task 9). Implement Task 9 before running this test, OR temporarily comment the `chat-context` export line and uncomment it in Task 9. Recommended: do Task 9 first if executing strictly in order — but the import is side-effect-free, so define `chat-context.ts` (Task 9 Step 3) before running this test.

- [ ] **Step 4: Run it (passes — after Task 9 file exists)**

Run: `npm run test -- index`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/index.ts src/lib/pricing/__tests__/index.test.ts
git commit -m "feat(pricing): public API and computeModel"
```

---

## Task 9: Chatbot grounding context

**Files:**
- Create: `src/lib/pricing/chat-context.ts`
- Test: `src/lib/pricing/__tests__/chat-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildChatContext, buildSystemPrompt } from "@/lib/pricing/chat-context";
import { computeBuyerEconomics } from "@/lib/pricing/buyer";
import { computeSellerEconomics } from "@/lib/pricing/seller";
import { buyerScenarios, sellerScenarios } from "@/lib/pricing/scenarios";
import { TIERS } from "@/lib/pricing/constants";
import type { BuyerInputs, SellerInputs } from "@/lib/pricing/types";

const b: BuyerInputs = {
  tierId: "enterprise", seats: 793, filingsPerSeatMonth: 3, hoursPerFiling: 2.5,
  blendedRate: 600, automationPct: 0.65, valueRealizationPct: 0.5, includeRiskEV: false, billingCycle: "annual",
};
const s: SellerInputs = { tierId: "enterprise", seats: 793, scansPerSeatMonth: 3, billingCycle: "annual" };

const snap = buildChatContext(
  computeBuyerEconomics(b, TIERS.enterprise),
  computeSellerEconomics(s, TIERS.enterprise),
  buyerScenarios(b, TIERS.enterprise),
  sellerScenarios(s, TIERS.enterprise),
  "enterprise",
);

describe("chat context", () => {
  it("snapshot carries computed numbers and disclaimer", () => {
    expect(snap.tier).toBe("enterprise");
    expect(snap.seller.revenueMonthly).toBe(79300);
    expect(snap.disclaimer.length).toBeGreaterThan(0);
    expect(snap.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("snapshot includes provenance-labeled constants", () => {
    expect(snap.constants.WC_TOTAL_LAWYERS.provenance).toBe("VERIFICADO");
  });
  it("system prompt forbids inventing numbers and embeds the snapshot", () => {
    const prompt = buildSystemPrompt(snap);
    expect(prompt).toMatch(/MODEL_SNAPSHOT/);
    expect(prompt.toLowerCase()).toMatch(/nunca inventes|no inventes/);
    expect(prompt).toContain("79300"); // a real computed figure is present
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- chat-context`
Expected: FAIL (cannot find module `chat-context`).

- [ ] **Step 3: Implement `src/lib/pricing/chat-context.ts`**

```ts
import { CONSTANTS, DISCLAIMER, MODEL_AS_OF } from "./constants";
import type {
  BuyerEconomics, ModelSnapshot, ScenarioSet, SellerEconomics, TierId,
} from "./types";

export function buildChatContext(
  buyer: BuyerEconomics,
  seller: SellerEconomics,
  buyerScenarios: ScenarioSet<BuyerEconomics>,
  sellerScenarios: ScenarioSet<SellerEconomics>,
  tier: TierId,
): ModelSnapshot {
  return {
    asOf: MODEL_AS_OF,
    tier,
    buyer,
    seller,
    buyerScenarios,
    sellerScenarios,
    constants: { ...CONSTANTS },
    disclaimer: DISCLAIMER,
  };
}

export function buildSystemPrompt(snapshot: ModelSnapshot): string {
  return [
    "Eres el analista de pricing de TraceIt. Respondes preguntas sobre la valoración",
    "financiera de la herramienta (costos, usuarios, ROI, escenarios) en lenguaje natural.",
    "",
    "REGLAS ESTRICTAS (anti-alucinación, igual que TraceIt aplica a las citas legales):",
    "1. Solo puedes usar números presentes en MODEL_SNAPSHOT. NUNCA inventes cifras.",
    "2. Si te preguntan algo que el snapshot no contiene, dilo explícitamente.",
    "3. Cita siempre la procedencia: VERIFICADO (con fuente) o HIPÓTESIS (editable).",
    "4. Los números los calcula el código de forma determinista, no tú.",
    "5. Recuerda el disclaimer: es ilustrativo, no una cotización en firme.",
    "",
    "MODEL_SNAPSHOT (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- chat-context`
Expected: PASS.

- [ ] **Step 5: Run the whole engine suite**

Run: `npm run test`
Expected: PASS (smoke, format, provenance, seller, buyer, scenarios, index, chat-context).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pricing/chat-context.ts src/lib/pricing/__tests__/chat-context.test.ts
git commit -m "feat(pricing): grounded chatbot snapshot + system prompt"
```

---

## Task 10: Frontend chat client

**Files:**
- Create: `src/lib/chat-client.ts`
- Test: `src/lib/__tests__/chat-client.test.ts`

- [ ] **Step 1: Write the failing test (mocked fetch)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendChatMessage } from "@/lib/chat-client";
import type { ModelSnapshot } from "@/lib/pricing/types";

const snapshot = { tier: "enterprise" } as unknown as ModelSnapshot;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("VITE_API_URL", "https://api.example.com");
});

describe("sendChatMessage", () => {
  it("POSTs messages + snapshot and returns the reply", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "El margen bruto es 97.2%." }),
    });
    const reply = await sendChatMessage([{ role: "user", content: "margen?" }], snapshot);
    expect(reply).toBe("El margen bruto es 97.2%.");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example.com/api/chat");
    expect(JSON.parse(init.body)).toMatchObject({ messages: [{ role: "user", content: "margen?" }] });
  });
  it("throws a friendly error on non-ok", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(sendChatMessage([{ role: "user", content: "x" }], snapshot)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm run test -- chat-client`
Expected: FAIL (cannot find module `chat-client`).

- [ ] **Step 3: Implement `src/lib/chat-client.ts`**

```ts
// Talks to the backend chat proxy (FastAPI on `main`). The Anthropic key lives
// ONLY on the server. The request carries the deterministic MODEL_SNAPSHOT so the
// LLM may explain figures but never invent them.
import type { ModelSnapshot } from "./pricing/types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  snapshot: ModelSnapshot,
): Promise<string> {
  if (!API_BASE) {
    throw new Error("Backend URL no configurada. Define VITE_API_URL y reconstruye la app.");
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, snapshot }),
    });
  } catch {
    throw new Error("No se pudo contactar el servicio de chat.");
  }
  if (!res.ok) {
    throw new Error("El servicio de chat falló. Inténtalo de nuevo.");
  }
  const body = (await res.json()) as { reply?: unknown };
  if (typeof body.reply !== "string") {
    throw new Error("Respuesta de chat inválida.");
  }
  return body.reply;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm run test -- chat-client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat-client.ts src/lib/__tests__/chat-client.test.ts
git commit -m "feat(chat): frontend client for the grounded pricing chatbot"
```

---

## Task 11: Wire `pricing.tsx` to the engine

**Files:**
- Modify: `src/routes/pricing.tsx`

Goal: delete the inline `PLANS` array and the `compute()` closure; drive the page from `@/lib/pricing`. Keep the existing visual structure and Tailwind classes. Add the enterprise tier and a "White & Case" preset.

- [ ] **Step 1: Replace imports and remove local pricing data**

At the top of `src/routes/pricing.tsx`, add:

```ts
import {
  TIERS_LIST,
  TIERS,
  computeBuyerEconomics,
  buyerScenarios,
  formatGBP,
  formatPct,
  type BuyerInputs,
  type TierId,
} from "@/lib/pricing";
```

Delete the local `type PlanId`, the `PLANS` constant array, and the local `GBP` helper (replace usages with `formatGBP`).

- [ ] **Step 2: Drive `PlanCards` from `TIERS_LIST`**

Replace `PLANS.map(...)` with `TIERS_LIST.map((p) => ...)`. For each tier compute the displayed price:

```ts
const price = p.pricePerSeatMonthly
  ? p.pricePerSeatMonthly.value // enterprise: £/seat/mo
  : annual
    ? p.priceMonthly!.value * p.annualFactor.value
    : p.priceMonthly!.value;
const priceSuffix = p.pricePerSeatMonthly ? "/abogado/mes" : annual ? "/mo, billed annually" : "/mo";
```

Use `p.forWho`, `p.name`, and replace the hardcoded `facts` list with a small derived list (price provenance + capacity + cost line) read from the tier's `Sourced` fields, e.g.:

```tsx
<li className="flex gap-2">
  <Check className="mt-0.5 h-4 w-4 shrink-0 text-action" />
  <span>
    {p.scanCapacity
      ? `Up to ${p.scanCapacity.value} scans / month`
      : `Fair-use ${p.scanCapacityPerSeat!.value} scans / lawyer / month`}
  </span>
</li>
```

Change `PlanId` references to `TierId` and `onChoose: (id: TierId) => void`.

- [ ] **Step 3: Replace the calculator math with the engine**

In `ReturnCalculator`, delete the local `compute()` function. Build `BuyerInputs` from the existing sliders and call the engine:

```ts
const tier = TIERS[planId];
const inputs: BuyerInputs = {
  tierId: planId,
  seats: planId === "enterprise" ? seats : 1,
  filingsPerSeatMonth: filings,
  hoursPerFiling,
  blendedRate: rate,
  automationPct: automation / 100,
  valueRealizationPct: realization / 100,
  includeRiskEV: false,
  billingCycle: annual ? "annual" : "monthly",
};
const eco = useMemo(() => computeBuyerEconomics(inputs, tier), [planId, seats, filings, hoursPerFiling, rate, automation, realization, annual]);
const scen = buyerScenarios(inputs, tier);
```

Add two new pieces of state for enterprise + realization:

```ts
const [seats, setSeats] = useState(793);
const [realization, setRealization] = useState(50); // %
```

Map the result fields onto the existing `<Metric>` / `<Scenario>` components:
- "Horas saved / mo" → `eco.hoursSavedMonthly`
- "Time value / mo" → `eco.realizedTimeValueMonthly` (realized, honest)
- "Plan cost / mo" → `eco.effectiveLicenseMonthly`
- "Net benefit / mo" → `eco.netBenefitMonthly`
- ROI → `eco.buyerRoiPct` (render `formatPct` or `×`)
- Sensitivity → `scen.conservative/base/optimistic .netBenefitMonthly`

- [ ] **Step 4: Add a "White & Case" preset button**

Inside the inputs panel, add a button that loads the anchor account:

```tsx
<button
  type="button"
  onClick={() => {
    setPlanId("enterprise");
    setSeats(TIERS.enterprise && 793);
    setRate(600);
    setFilings(3);
    setHoursPerFiling(2.5);
    setAutomation(65);
    setRealization(50);
  }}
  className="rounded-lg border border-action px-3 py-1.5 text-xs font-semibold text-action"
>
  Cargar caso White &amp; Case
</button>
```

Show the seats slider only when `planId === "enterprise"`.

- [ ] **Step 5: Source the "Honesty" table from constants**

In the `Honesty` component, keep the rows but ensure the hallucination/wasted-costs claims reference the engine constants (import `CONSTANTS` and render `CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.source`), removing the standalone "~1 in 6" vs "0.43" mismatch. In `DemandSection`:
- Replace the single "~1 in 6" stat with the **17–34% range** for legal-AI tools, citing `CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE` (Lexis 17%) and `CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE` (Westlaw 34%); show the `~58–82%` general-LLM figure from `CONSTANTS.GENERAL_LLM_HALLUCINATION_RATE`, labeled distinctly.
- Add a named **trigger** line citing **Ayinde v Haringey [2025] EWHC 1383** (the demand-side anchor: sanctions + SRA/BSB referrals for AI-fabricated citations) next to the CPR r.44.11 stat.
- Source the wasted-costs figure from `CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT` (£13.5k, Ayinde), with the reputational exposure noted as qualitative "on top".

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/routes/pricing.tsx
git commit -m "refactor(pricing): consume deterministic engine; add enterprise tier + W&C preset"
```

---

## Task 12: Minimal grounded chat panel

**Files:**
- Create: `src/components/citationguard/ChatPanel.tsx`
- Modify: `src/routes/pricing.tsx` (mount the panel)

- [ ] **Step 1: Create `src/components/citationguard/ChatPanel.tsx`**

```tsx
import { useState } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/chat-client";
import { buildChatContext } from "@/lib/pricing";
import type {
  BuyerEconomics, ScenarioSet, SellerEconomics, TierId,
} from "@/lib/pricing";

interface ChatPanelProps {
  buyer: BuyerEconomics;
  seller: SellerEconomics;
  buyerScenarios: ScenarioSet<BuyerEconomics>;
  sellerScenarios: ScenarioSet<SellerEconomics>;
  tier: TierId;
}

export function ChatPanel(props: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const snapshot = buildChatContext(
        props.buyer, props.seller, props.buyerScenarios, props.sellerScenarios, props.tier,
      );
      const reply = await sendChatMessage(next, snapshot);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-n300 bg-surface p-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-action">
        Pregúntale al modelo
      </p>
      <p className="mt-1 text-sm text-n500">
        Habla con el analista de pricing. Solo usa cifras del modelo determinista; no inventa números.
      </p>
      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <span
              className={`inline-block rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-ink text-paper" : "bg-n100 text-ink"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="¿Cuál es el margen para White & Case?"
          className="flex-1 rounded-lg border border-n300 bg-paper px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {busy ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the panel in `pricing.tsx`**

In `ReturnCalculator`, after computing `eco` and `scen`, also compute seller economics + scenarios and render `<ChatPanel>` below the calculator grid:

```tsx
import { computeSellerEconomics, sellerScenarios } from "@/lib/pricing";
import { ChatPanel } from "@/components/citationguard/ChatPanel";
// ...
const sellerInputs = { tierId: planId, seats: planId === "enterprise" ? seats : 1, scansPerSeatMonth: filings, billingCycle: annual ? "annual" : "monthly" } as const;
const sellerEco = computeSellerEconomics(sellerInputs, tier);
const sellerScen = sellerScenarios(sellerInputs, tier);
// ...in JSX, below the two-column grid:
<div className="mt-8">
  <ChatPanel
    buyer={eco}
    seller={sellerEco}
    buyerScenarios={scen}
    sellerScenarios={sellerScen}
    tier={planId}
  />
</div>
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. (Chat will only respond once the backend `/api/chat` endpoint exists — Task 13 contract.)

- [ ] **Step 4: Commit**

```bash
git add src/components/citationguard/ChatPanel.tsx src/routes/pricing.tsx
git commit -m "feat(chat): grounded pricing chat panel on the pricing page"
```

---

## Task 13: Backend `/api/chat` contract doc

**Files:**
- Create: `docs/superpowers/specs/2026-06-27-api-chat-contract.md`

The Python implementation lives on the `main` branch (FastAPI → Railway). This task only documents the contract the frontend depends on.

- [ ] **Step 1: Write the contract doc**

```markdown
# Contrato: POST /api/chat (chatbot de pricing anclado)

Implementación: backend FastAPI (rama `main` → Railway). La API key de Anthropic vive
SOLO como variable de entorno del backend (`ANTHROPIC_API_KEY`), nunca en el browser.

## Request
`POST {API_BASE}/api/chat`
```json
{
  "messages": [{ "role": "user", "content": "¿Cuál es el margen para White & Case?" }],
  "snapshot": { "...": "ModelSnapshot del motor (src/lib/pricing/types.ts)" }
}
```

## Response
```json
{ "reply": "El margen bruto es 97.2% (VERIFICADO/HIPÓTESIS según el snapshot)..." }
```

## Lógica del backend
1. Validar entrada (pydantic): `messages` no vacío, longitud acotada; `snapshot` objeto.
2. `system = buildSystemPrompt(snapshot)` — mismas reglas que `src/lib/pricing/chat-context.ts`
   (solo usar cifras del snapshot; nunca inventar; citar procedencia).
3. Llamar Anthropic Messages API con `model = "claude-haiku-4-5"`, `system`, y `messages`.
4. Devolver `{ "reply": <texto del assistant> }`.
5. Errores → `{ "detail": "..." }` con status apropiado (el cliente ya lo maneja).

## Seguridad
- Rate-limit por IP.
- Límite de tamaño de `messages` y `snapshot`.
- CORS permitido solo para el dominio del frontend.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-27-api-chat-contract.md
git commit -m "docs(chat): backend /api/chat contract for the grounded chatbot"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §2 data model → Task 2. §3 constants/tiers/W&C/competitors → Task 4 (+ §3.6 cited in spec). §4 chains → Tasks 5–6. §5 KPIs → Tasks 5–6. §6 scenarios → Task 7. §7 guards (clamp, dominantCost, realization, uncertainty, disclaimer) → Tasks 5–6 + constants. §8 chatbot → Tasks 9–10, 12–13. §9 validation (master example, edges, coherence, provenance) → Tasks 4–7. §10 UI wiring → Tasks 11–12. §11 deliverables → all. Covered.
- Master-example numbers in tests (Tasks 5–6) match spec §9.1 exactly (revenue 79,300; contribution 77,109.68; margin 97.24%; payback 1.556; LTV 15,421,936; LTV/CAC 128.5; buyer net 1,080,462.50; ROI 13.625).

**Placeholder scan:** No "TBD/TODO". The only deferred items (exact Stanford cite, FX) are resolved with concrete cited values in `constants.ts` (Dahl et al. 2024 / Magesh et al. 2024) and flagged `editable`.

**Type consistency:** `Sourced<T>`, `Tier`, `BuyerInputs`, `SellerInputs`, `BuyerEconomics`, `SellerEconomics`, `ScenarioSet<T>`, `ModelSnapshot`, `computeBuyerEconomics`, `computeSellerEconomics`, `buyerScenarios`, `sellerScenarios`, `buildChatContext`, `buildSystemPrompt`, `sendChatMessage`, `formatGBP/Pct/Ratio/Months` used identically across tasks. Enterprise uses `pricePerSeatMonthly` + `scanCapacityPerSeat`; SMB uses `priceMonthly` + `scanCapacity`. `computeModel` (Task 8) consistent with both compute fns.

**Note on order:** `index.ts` (Task 8) re-exports `chat-context` (Task 9). When executing strictly in order, create `src/lib/pricing/chat-context.ts` (Task 9 Step 3) before running the Task 8 test, or temporarily comment that one export line.
