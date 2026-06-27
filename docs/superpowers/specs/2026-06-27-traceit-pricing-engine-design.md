# TraceIt — Motor financiero y analítico de pricing (diseño)

**Fecha:** 2026-06-27
**Autor:** modelado financiero (unit economics determinista)
**Estado:** spec para revisión
**Rama:** `front` (frontend TanStack Start). El endpoint del chatbot vive en el backend FastAPI (`main` → Railway).

---

## 0. Propósito y criterio rector

Construir el **motor** (modelo de datos, fórmulas, KPIs, métricas) que alimenta la página
de pricing de TraceIt. **No** es UI: es la capa de cálculo auditable y única fuente de verdad.

**Principio rector:** toda cifra es determinista, tiene fuente y se puede recalcular a mano.
Si un número no se puede reproducir paso a paso, no entra al modelo.

**Criterio de los jueces (Hack the Law) al que se alinea todo:**
> "Would you fund or back this? Is there a credible path to a real product, a market that
> wants it, and a team that could build it?"

El motor responde con dos lentes reconciliadas desde **una sola** fuente de constantes:

| Pilar del jurado | Lente del motor |
|---|---|
| "un mercado que lo quiere" | **Comprador**: ROI (horas ahorradas + riesgo evitado vs. precio) |
| "¿lo financiarías?" | **Vendedor**: margen de contribución, payback de CAC, LTV/CAC, break-even de clientes |
| "camino creíble a producto real" | determinismo + procedencia + costo-de-servir bajo y real |

**Comprador principal:** White & Case (challenge del hackathon). El motor modela la cuenta
W&C como **cuenta ancla Enterprise** con sus cifras reales y citadas, **y además** conserva
tiers SMB (Bar inglés) como *wedge* self-serve para demostrar que la solución es vendible al
mercado amplio (estrategia land-and-expand).

---

## 1. Arquitectura del módulo (única fuente de verdad)

Todo vive en `src/lib/pricing/`. Ninguna cifra "mágica" fuera de aquí. `pricing.tsx` y
`FinancialPanel.tsx` dejan de calcular y pasan a **consumir** el motor.

```
src/lib/pricing/
  types.ts          # Provenance, Sourced<T>, Tier, BuyerInputs, SellerInputs, *Economics
  constants.ts      # TODAS las constantes (macro, costos, tiers, mercado, W&C) con procedencia
  buyer.ts          # funciones puras: cadena ROI del comprador + KPIs
  seller.ts         # funciones puras: cadena unit-economics del vendedor + KPIs
  scenarios.ts      # conservador / base / optimista por lente
  format.ts         # formateo GBP / % / ratio determinista
  chat-context.ts   # construye MODEL_SNAPSHOT + system prompt anclado para el chatbot
  index.ts          # API pública del motor
  __tests__/        # vitest: ejemplo maestro, casos límite, coherencia, procedencia
```

Se añade `vitest` como devDependency (natural en un proyecto Vite) y el script `"test": "vitest run"`.

**Principios no negociables:** determinismo total · funciones puras (sin efectos) ·
inmutabilidad (entradas `Readonly`, salidas con spread) · todo número con etiqueta de procedencia.

---

## 2. Modelo de datos tipado

```ts
type Provenance = "VERIFICADO" | "HIPOTESIS";

interface Sourced<T> {
  value: T;
  unit: string;            // "GBP/mes", "scans/mes", "%", "ratio", "USD/lawyer"
  provenance: Provenance;
  source: string;          // cita con URL/fecha, o "estimación interna"
  asOf: string;            // ISO "2026-06-27"
  editable: boolean;       // true para HIPÓTESIS ajustables en UI
  note?: string;
}

type TierId = "junior" | "chambers" | "firm" | "enterprise";

interface Tier {
  id: TierId;
  name: string;
  forWho: string;
  // SMB: precio fijo por tier. Enterprise: precio por-abogado (seats).
  priceMonthly: Sourced<number> | null;        // null para enterprise (usa pricePerSeatMonthly)
  pricePerSeatMonthly: Sourced<number> | null;  // null para SMB
  annualFactor: Sourced<number>;                // 1.0 para enterprise (ya es anual neto)
  scanCapacity: Sourced<number>;                // tope honesto de scans/mes (qué lo limita)
  implementationCost: Sourced<number>;          // una vez
  cac: Sourced<number>;
  monthlyChurn: Sourced<number>;
  supportMonthly: Sourced<number>;              // costo-de-servir no-infra (CSM)
  featured?: boolean;
}

interface BuyerInputs {        // lo que el prospecto ajusta
  tierId: TierId;
  seats: number;               // abogados que usan (SMB: 1; enterprise: subconjunto disputas)
  filingsPerSeatMonth: number;
  hoursPerFiling: number;
  blendedRate: number;         // £/h
  automationPct: number;       // perilla de honestidad [0.20, 1.0]
  valueRealizationPct: number; // % de horas ahorradas que se vuelven £ (rebill/redeploy) [0,1]
  includeRiskEV: boolean;
  billingCycle: "monthly" | "annual";
}

interface SellerInputs {       // palancas del negocio (defaults editables)
  tierId: TierId;
  seats: number;
  scansPerSeatMonth: number;
  billingCycle: "monthly" | "annual";
  // CAC, churn, support, fixed se toman del tier + constantes macro, override opcional.
}

interface BuyerEconomics {
  effectiveLicenseMonthly: number;
  valuePerFiling: number;
  hoursSavedMonthly: number;
  timeValueMonthly: number;        // bruto
  realizedTimeValueMonthly: number; // × valueRealizationPct (honesto)
  riskEVMonthly: number;           // separado, etiquetado
  netBenefitMonthly: number;
  buyerRoiPct: number | null;      // null si licencia 0
  buyerBreakEvenFilings: number;   // Infinity si valuePerFiling <= 0
  perSeat: { valueMonthly: number; costMonthly: number; roiPct: number | null };
  uncertainty: string[];           // qué inputs eran HIPÓTESIS
}

interface SellerEconomics {
  revenueMonthly: number;
  variableCostPerScan: number;
  scansMonthly: number;            // tras clamp de capacidad
  capacityClamped: boolean;
  variableCostMonthly: number;
  costToServeMonthly: number;      // variable + support
  contributionMonthly: number;
  grossMarginPct: number;          // 0 si revenue 0
  productGrossMarginPct: number;   // ex-support (solo infra/LLM)
  companyBreakEvenCustomers: number; // Infinity si contribución <= 0
  cacPaybackMonths: number | null;   // null si contribución <= 0
  ltv: number | null;                // Infinity flag si churn 0
  ltvCacRatio: number | null;
  meetsLtvCacTarget: boolean;        // >= 3
  minViableSeats: number;            // asientos para LTV/CAC >= 3 (piso mid-market); Infinity si no aplica
  dominantCost: "infra" | "llm" | "support" | "cac";
  uncertainty: string[];
}
```

---

## 3. Tabla de supuestos (constantes con procedencia)

> Leyenda: **V** = VERIFICADO (fuente citable), **H** = HIPÓTESIS (editable).
> `asOf` = 2026-06-27 salvo nota.

### 3.1 Macro

| Constante | Valor | Unidad | Tipo | Fuente / nota |
|---|---|---|---|---|
| `fxUsdPerGbp` | 1.27 | USD/£ | H | tasa aprox. 2025–2026 (re-verificar día del pitch) |
| `annualFactorSmb` | 0.80 | ratio | H | política de descuento −20% (tiers SMB) |
| `billableHoursPerLawyerYear` | 1,800 | h/año | H | objetivo típico BigLaw (deriva la tarifa del RPL) |
| `directWastedCostsPerIncident` | 13,500 | £ | V | Ayinde v Haringey [2025] EWHC 1383 — wasted costs £2k+IVA/abogado + ~£7k costas cliente recortadas |
| `reputationalExposurePerIncident` | 0 (editable) | £ | H | exposición SRA/strike-out/seguro PII — cualitativa "por encima"; sube si se cuantifica |
| `legalRagHallucinationRate` (Lexis+ AI) | 0.17 | ratio | V | Magesh et al., Stanford RegLab 2024 — Lexis+ AI (~1 de cada 6) |
| `westlawAiHallucinationRate` | 0.34 | ratio | V | Magesh et al., Stanford RegLab 2024 — Westlaw AI (~1 de cada 3) |
| `generalLlmHallucinationRate` | 0.58 | ratio | V | Dahl et al., Stanford RegLab 2024 (arXiv:2401.01301) — LLM general en derecho (58–82%) |

**Nota de corrección (resuelta con el research de mercado):** hoy `types.ts` define
`baseline_hallucination_rate: 0.43` y `pricing.tsx` dice "~1 de cada 6". El 0.43 es reporting
secundario suelto y **se descarta**. El motor usa **tres** cifras de Stanford distintas y citadas:
**Lexis+ AI 17% · Westlaw AI 34% · LLM general 58–82%**. El cálculo de riesgo usa la conservadora
(17%, herramienta legal con RAG). El mensaje de demanda usa el rango "17–34%".

### 3.2 Tiers (SMB wedge + Enterprise ancla)

| Tier | Precio | Capacidad | Impl. | CAC | Churn/mes | Support/mes | Tipo precio |
|---|---|---|---|---|---|---|---|
| junior | £49/mes | 20 scans | £0 | £400 (H) | 3% (H) | £0 | V |
| chambers | £290/mes | 200 scans | £0 | £400 (H) | 3% (H) | £0 | V |
| firm | £950/mes | 2,000 (fair-use, H) | £500 (H) | £1,500 (H) | 2% (H) | £200 (H) | V |
| **enterprise** | **£100/abogado/mes (H)** | seats × 50/mes (H) | £5,000 (H) | **£40,000 (H)** | 0.5% (H) | £2,000 (H) | H |

- Precios SMB = **V** (precios actuales del equipo en la página).
- Enterprise `pricePerSeatMonthly` = £100/abogado/mes es la **hipótesis clave de willingness-to-pay**,
  anclada a competidores (CoCounsel ~$225, Lexis+ AI ~$200, vLex Vincent ~$79; Harvey ~$1,200 es el techo —
  ver §3.6). TraceIt es una capa estrecha de *integridad/verificación*, no una suite, así que se ubica como
  premium de punto por debajo de las suites (≈ £1,200/abogado/año; editable). Para W&C disputas
  (793 seats) → **ACV ≈ £951,600/año** (~7% del valor generado, 0.026% del ingreso de W&C).
- `cacEnterprise` = £40,000 está anclado a benchmarks (legaltech enterprise ~£5k — verycreatives 2025;
  fintech-ent tope ~$14.7k — First Page Sage). £40k = ~6×–8× el benchmark, **justificado por el ciclo
  BigLaw de 6–9 meses y el comité de ~6.8 stakeholders**, no inflado. Es **el cuello de botella real**
  (no la infra). El payback rápido a escala W&C es real *porque W&C es enorme*; el KPI **`minViableSeats`**
  (§5) muestra honestamente el piso de asientos bajo el cual el motion enterprise se invierte (la
  "trampa mid-market" que detectó el market-validator). Por eso se aterriza primero con el wedge
  SMB/Bar de bajo CAC (£400–£1,500). Editable (rango £5k–£60k).

### 3.3 Costos unitarios y fijos

| Constante | Valor | Unidad | Tipo | Fuente / nota |
|---|---|---|---|---|
| `llmCostPerScan` | 0.08 | £/scan | H | Claude Haiku pricing × ~tokens/filing |
| `apiCostPerScan` (legislation.gov.uk) | 0 | £ | V | API pública gratuita |
| `variableCostPerScan` | 0.08 | £/scan | H | = LLM + API |
| `fixedPlatformMonthly` | 70 | £/mes | H | Neo4j Aura ~£50 + Railway ~£15 + dominio ~£5 (Cloudflare Pages £0, V) |

### 3.4 White & Case — cuenta ancla (cifras citadas)

| Dato | Valor | Tipo | Fuente |
|---|---|---|---|
| Ingreso bruto FY2025 | $3.6 bn (+8.5%) | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| PEP FY2025 | $4.4 M (+10%) | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) / [Law360](https://www.law360.com/pulse/articles/2293381/white-case-s-pep-earnings-hit-record-4m-in-2024) |
| RPL FY2025 | $1.4 M (+6%) | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| `wcTotalLawyers` | 2,643 | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| Oficina Londres (ingreso) | ~$584 M | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| Equity / total partners | 332 / 693 | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| Red global | 43–44 oficinas, 29–31 países | V | [whitecase.com/locations](https://www.whitecase.com/locations) |
| Meta estratégica | $5 bn para 2028 | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-revenue-hits-36bn-as-pep-jumps-10-290647087) |
| NQ associate Londres | £175k salario | V | [Global Legal Post](https://www.globallegalpost.com/news/white-case-boosts-pay-for-newly-qualified-london-associates-by-17-to-ps175k-888525688) |
| `wcDisputesShare` | 0.30 (rango 0.20–0.30) | H | fundamentado: nº1 GAR arbitraje; ~60 abogados disputas solo en París ([Legal 500](https://www.legal500.com/firms/51054-white-case-llp/global/lawyers)); 51 líderes de mercado |
| `wcDisputesLawyers` (derivado) | round(2,643 × 0.30) = **793** | H | seats por defecto de la cuenta ancla |
| `wcBlendedRateGbp` (derivado) | RPL/horas/FX = 1,400,000 / 1,800 / 1.27 ≈ **£612/h** (default £600) | V-derivado | componentes: RPL (V), horas (H), FX (H) |

> La tarifa *rack* de socio más reciente y citable es ABA Journal **$1,260/h (~2011, obsoleta)**.
> Por eso el modelo usa la **tarifa efectiva derivada del RPL** (Am Law, primer nivel), no un
> número inventado.

### 3.5 Mercado (TAM / SAM / SOM) — cifras duras (market-research, re-verificar el día del pitch)

**TAM — anclar en legal-AI, no en legal-tech genérico:**
- Legal AI: **$3.11 bn (2025) → $10.82 bn (2030), CAGR 28.3%** (MarketsandMarkets 2025). *Aquí vivimos.*
- Legal tech global: $28.7 bn → $69.7 bn, CAGR 12.2% (Grand View 2025). *Demasiado amplio.*

**SAM — wedge bottom-up UK (cifras duras):**
- **17,864 barristers** en ejercicio (E&W); ~14,847 self-employed; 2,147 KC — Bar Council jun 2025.
- **~8,900 firmas de solicitors**; ~171,700 solicitors — SRA 2024–26.
- Ancla enterprise: "Global Elite" ≈ **20–30 firmas** con disputas en Londres (Am Law 100 ≈ $160 bn combinados).

**Señales de willingness-to-pay (gasto real):**
- Firmas Am Law 100 gastan **$15k–$30k+/abogado/año** en tecnología (~2–4% de ingresos).
- Un asiento de Westlaw ronda **$1,600–$3,200/abogado/año** → £300/abogado/año (= £25/mes) es **fricción casi nula**.
- 96% de firmas UK usan IA; 34% planean invertir >£100k en tech el próximo año (Clio Legal Trends UK 2025).

**SOM (estimado, 3 años):** ~6 anclas enterprise (1,800 asientos ≈ £540k) + 40 chambers (£288k) +
120 firmas SMB de disputas (£432k) ≈ **£1.26 M ARR**; sensibilidad hasta **£3–3.5 M** con 15 anclas.
Es un **techo de wedge** honesto — la historia es land-and-expand + Europa, no capturar el TAM completo.

Cada cifra se modela como `Sourced<>` con `note: "re-verificar día del pitch"`.

### 3.6 Benchmark de precios de competidores (legal AI, por seat/mes) — citado

| Competidor | Precio/seat/mes | Tipo | Fuente |
|---|---|---|---|
| Harvey AI | $1,200 base (>$1M/año en Am Law 100) | suite completa | [eesel AI](https://www.eesel.ai/blog/harvey-ai-pricing) · [The Legal Prompts](https://thelegalprompts.com/blog/ai-legal-tools-pricing-comparison) |
| CoCounsel (Thomson Reuters) | $225 add-on (~$300–600 con Westlaw) | research + review | [The Legal Prompts](https://thelegalprompts.com/blog/ai-legal-tools-pricing-comparison) |
| Lexis+ AI / Protégé | ~$200+, custom | research | [The Legal Prompts](https://thelegalprompts.com/blog/ai-legal-tools-pricing-comparison) |
| Paxton AI | $49–$499 | research | [Elephas](https://elephas.app/resources/legal-ai-tools-pricing-comparison) |
| Spellbook | $100–$350 | drafting | [Spellbook](https://www.spellbook.legal/pricing) |
| vLex Vincent | ~$79 | research | [Elephas](https://elephas.app/resources/legal-ai-tools-pricing-comparison) |

**Posicionamiento de TraceIt:** capa de **integridad/verificación** (más estrecha que las suites de
research/drafting), premium de punto a **£100/seat/mes (~$127)** — por encima del piso (vLex $79) y por
debajo de research suites (CoCounsel/Lexis), muy por debajo de Harvey. El costo marginal cercano a cero
(§3.3) significa que casi todo el precio es contribución → margen de producto ~99%.

---

## 4. Las dos cadenas de unit economics (en orden, funciones puras)

### 4.1 Comprador — `computeBuyerEconomics(inputs, constants): BuyerEconomics`

1. `effectiveLicenseMonthly` = SMB: `priceMonthly × (annual? annualFactor : 1)` · Enterprise: `seats × pricePerSeatMonthly`.
2. `valuePerFiling` = `hoursPerFiling × automationPct × blendedRate`.
3. `hoursSavedMonthly` = `seats × filingsPerSeatMonth × hoursPerFiling × automationPct`.
4. `timeValueMonthly` = `hoursSavedMonthly × blendedRate`.
5. `realizedTimeValueMonthly` = `timeValueMonthly × valueRealizationPct`. *(Honestidad: las horas ahorradas solo son £ si se re-facturan o re-despliegan.)*
6. `riskEVMonthly` (si `includeRiskEV`) = `seats × filingsPerSeatMonth × citationsPerFiling × legalRagHallucinationRate × pReachesCourt × (directWastedCostsPerIncident + reputationalExposurePerIncident)`. **Separado**, no se mezcla con el ahorro de tiempo. El componente directo (£13.5k) es VERIFICADO (Ayinde); el reputacional es HIPÓTESIS editable (default 0 → cualitativo "por encima").
7. `netBenefitMonthly` = `realizedTimeValueMonthly (+ riskEVMonthly) − effectiveLicenseMonthly`.
8. KPIs: `buyerRoiPct`, `buyerBreakEvenFilings`, `perSeat`.

### 4.2 Vendedor — `computeSellerEconomics(inputs, constants): SellerEconomics`

1. `revenueMonthly` = `effectiveLicenseMonthly` (mismo precio que paga el comprador).
2. `variableCostPerScan` = Σ(costos unitarios) = `llmCostPerScan + apiCostPerScan`.
3. `scansMonthly` = `clamp(seats × scansPerSeatMonth, 0, scanCapacity)` → marca `capacityClamped`.
4. `variableCostMonthly` = `scansMonthly × variableCostPerScan`.
5. `costToServeMonthly` = `variableCostMonthly + supportMonthly`.
6. `contributionMonthly` = `revenueMonthly − costToServeMonthly`.
7. `grossMarginPct` = `contributionMonthly / revenueMonthly` (0 si revenue 0).
8. KPIs: `companyBreakEvenCustomers`, `cacPaybackMonths`, `ltv`, `ltvCacRatio`, `minViableSeats`, `dominantCost`.

**`minViableSeats`** (responde a la "trampa mid-market" del market-validator): asientos mínimos
para que `LTV/CAC ≥ 3`. Con contribución por-asiento marginal `m = pricePerSeat − scansPerSeat × variableCostPerScan`:
`minViableSeats = ⌈(3 × CAC × churn + supportMonthly) / m⌉` (Infinity si `m ≤ 0`, p.ej. tiers SMB no por-asiento).

---

## 5. Diccionario de KPIs (fórmula · caso límite · lectura)

### Comprador — "un mercado que lo quiere"
| KPI | Fórmula | Caso límite | Lectura |
|---|---|---|---|
| ROI del plan | `netBenefit / effectiveLicense` | licencia 0 → `null` | retorno por £ gastada |
| Break-even (filings) | `⌈effectiveLicense / valuePerFiling⌉` | `valuePerFiling ≤ 0` → **Infinity** | cuántos filings cubren la cuota |
| Valor por abogado | `filings × hours × automation × rate × realization` | — | intuición a nivel individuo |
| Riesgo evitado (EV) | ver §4.1.6 | separado, etiqueta H | downside que se evita (no se suma al tiempo) |

### Vendedor — "¿lo financiarías?"
| KPI | Fórmula | Caso límite | Lectura |
|---|---|---|---|
| Margen bruto % | `contribution / revenue` | revenue 0 → 0 | salud del producto |
| Margen producto % (ex-support) | `(revenue − variableCost) / revenue` | revenue 0 → 0 | margen "puro" infra/LLM |
| Break-even (clientes) | `⌈fixedPlatformMonthly / contribution⌉` | `contribution ≤ 0` → **Infinity** | clientes para no perder |
| Payback CAC (meses) | `CAC / contribution` | `contribution ≤ 0` → **null** | el KPI del inversor |
| LTV | `contribution / monthlyChurn` | churn 0 → **Infinity** (flag) | valor de vida del cliente |
| LTV/CAC | `LTV / CAC` | CAC 0 → **null** | **número de fundabilidad** (objetivo ≥ 3) |
| **Asientos mín. viables** | `⌈(3·CAC·churn + support) / m⌉`, `m = precio/seat − scans·costoVar` | `m ≤ 0` → **Infinity** | **piso mid-market**: bajo este nº de asientos el motion enterprise se invierte |
| Capacidad máxima | `⌊scanCapacity / scansPerSeatMonth⌋` | — | tope honesto de seats por límite del tier |
| Costo dominante | argmax(infra, llm, support, cac amortizado) | — | el cuello de botella real (honestidad) |

---

## 6. Escenarios y sensibilidad

Nunca un solo número. Por lente, **conservador / base / optimista** variando la palanca más incierta:

- **Comprador:** varía `automationPct` → 0.6× / 1.0× / 1.4× (clamp [0.20, 1.0]). Reporta set completo de KPIs.
- **Vendedor:** varía la combinación `CAC × churn` (las dos palancas dominantes):
  - conservador = CAC alto (1.4×) + churn alto (2×),
  - base = 1.0×,
  - optimista = CAC bajo (0.7×) + churn bajo (0.5×).
- **Siempre** respeta el clamp de capacidad en cada escenario.

---

## 7. Guardas y honestidad

- **Clamp de capacidad** en cada cálculo de vendedor; el modelo nunca proyecta sobre el tope del tier.
- **Cuello de botella explícito:** `dominantCost` calcula qué pesa más. Para enterprise será
  **support + CAC**, no la infra; se muestra y es editable. No se pinta margen de fantasía.
- **Realización de valor (`valueRealizationPct`):** evita la fantasía de que cada hora ahorrada = £ puro.
- **Margen vs benchmark (honestidad clave):** el benchmark LLM-native es **52–65%** (Bessemer 2025 / ICONIQ
  2026). El motor reporta ~97% **porque el verdict path es determinista** (el LLM no es load-bearing; solo
  el advisory, cacheable). Para no sobre-vender: `llmCostPerScan` es editable y prominente, y el escenario
  conservador de vendedor incluye un costo-LLM alto (long-context) que muestra que el margen aguanta a
  escala enterprise. Si el scan invocara long-context sin cache, el rango honesto bajaría a 65–75%.
- **`minViableSeats`** se muestra junto a LTV/CAC: no esconder dónde el motion enterprise deja de cerrar.
- **Etiqueta de incertidumbre** (`uncertainty[]`) en cada salida: lista los inputs HIPÓTESIS usados.
- **Disclaimer de alcance** (constante reusable): "ilustrativo/analítico, no una cotización en firme;
  el abogado firmante sigue siendo responsable de toda autoridad."

---

## 8. Chatbot anclado (motor → Claude, sin alucinar)

- **`buildChatContext(buyerInputs, sellerInputs): ModelSnapshot`** — JSON determinista con:
  constantes (+procedencia), economía comprador y vendedor calculada, escenarios, `dominantCost`,
  `uncertainty`, disclaimer.
- **`buildSystemPrompt(snapshot): string`** — reglas: *"Eres el analista de pricing de TraceIt.
  Solo puedes usar números presentes en MODEL_SNAPSHOT. Nunca inventes cifras. Si algo no está en el
  snapshot, dilo. Cita siempre la procedencia (VERIFICADO/HIPÓTESIS). Los números los calcula el
  código, no tú."* (Mismo anclaje anti-alucinación que TraceIt aplica a las citas legales.)
- **Frontend:** `src/lib/chat-client.ts` → `POST {VITE_API_URL}/api/chat` con `{ messages, snapshot }`.
  Más un panel de chat mínimo en la página de pricing (superficie de información permitida; no rediseño estético).
- **Backend (FastAPI, Railway — rama `main`):** contrato del endpoint:
  - **Request:** `{ messages: {role, content}[], snapshot: ModelSnapshot }`
  - **Response:** `{ reply: string }` (o stream SSE en v2)
  - La **API key de Anthropic vive solo como env var del backend**, nunca en el browser.
  - Modelo sugerido: `claude-haiku-4-5` (barato, suficiente para explicar cifras dadas).
  - El backend inyecta `buildSystemPrompt(snapshot)` como system y pasa `messages`.
  - **Validación de entrada (zod/pydantic):** límite de longitud de mensajes, snapshot bien formado.
  La implementación Python va en la otra rama; aquí se entrega el contrato + cliente + system prompt.

---

## 9. Suite de validación (entregada con el motor)

### 9.1 Ejemplo maestro resuelto a mano — cuenta ancla White & Case (anual)

**Inputs:** `seats=793`, `pricePerSeatMonthly=£100`, `filingsPerSeatMonth=3`, `hoursPerFiling=2.5`,
`automationPct=0.65`, `blendedRate=£600`, `valueRealizationPct=0.50`, `scansPerSeatMonth=3`,
`llmCostPerScan=£0.08`, `supportMonthly=£2,000`, `cac=£40,000`, `monthlyChurn=0.005`,
`fixedPlatformMonthly=£70`, `scanCapacity = 793×50 = 39,650`.

**Vendedor (paso a paso):**
1. revenue/mes = 793 × 100 = **£79,300**
2. scans/mes = min(793 × 3, 39,650) = 2,379 (sin clamp)
3. variableCost/mes = 2,379 × 0.08 = **£190.32**
4. costToServe/mes = 190.32 + 2,000 = **£2,190.32**
5. contribution/mes = 79,300 − 2,190.32 = **£77,109.68**
6. grossMargin% = 77,109.68 / 79,300 = **97.24%**
7. productGrossMargin% (ex-support) = (79,300 − 190.32)/79,300 = **99.76%**
8. companyBreakEvenCustomers = ⌈70 / 77,109.68⌉ = **1**
9. cacPaybackMonths = 40,000 / 77,109.68 = **0.52 meses**
10. ltv = 77,109.68 / 0.005 = **£15,421,936**
11. ltvCacRatio = 15,421,936 / 40,000 = **385.5** (≥ 3 ✓) · `dominantCost` (ongoing) = **support**
12. minViableSeats = ⌈(3 × 40,000 × 0.005 + 2,000) / (100 − 3×0.08)⌉ = ⌈2,600 / 99.76⌉ = **27**
    (piso mid-market: bajo 27 asientos el motion enterprise se invierte; W&C = 793 ✓)

> El payback de **0.52 meses** es real, no maquillado: es la consecuencia de un ACV enorme
> (£951.6k/año) con un CAC de benchmark (£40k). La honestidad está en `minViableSeats = 27`: el
> mismo CAC con una firma de 20 asientos **no** cierra. Por eso el GTM aterriza con el wedge SMB/Bar
> (CAC £400–£1,500) antes de correr el motion enterprise.

**Comprador (paso a paso):**
1. valuePerFiling = 2.5 × 0.65 × 600 = **£975**
2. hoursSaved/mes = 793 × 3 × 2.5 × 0.65 = **3,865.875 h**
3. timeValue/mes = 3,865.875 × 600 = **£2,319,525**
4. realizedTimeValue/mes = 2,319,525 × 0.50 = **£1,159,762.50**
5. effectiveLicense/mes = **£79,300**
6. netBenefit/mes = 1,159,762.50 − 79,300 = **£1,080,462.50** (≈ £12.97 M/año)
7. buyerRoi = 1,080,462.50 / 79,300 = **13.6×** (1,363%)
8. perSeat: valor £2,925/mes (bruto) → £1,462.50 realizado vs £100 coste → ROI **13.6×**

> Estas cifras son grandes porque reflejan la economía real de BigLaw a £600/h. Se presentan
> **por-abogado** (más intuitivo) y con escenario **conservador** (automation 0.40, realization 0.50)
> para no sobre-prometer. El test asserta coincidencia exacta con el output del motor.

### 9.2 Tests de casos límite
- contribución ≤ 0 → `companyBreakEvenCustomers = Infinity` y `cacPaybackMonths = null`
  (inputs: `pricePerSeatMonthly` muy bajo o `supportMonthly` muy alto).
- utilidad/contribución ≤ 0 → payback `null`.
- ingreso 0 → `grossMarginPct = 0` (sin división por cero).
- uso > capacidad → `scansMonthly` clamped, `capacityClamped = true` (junior cap 20, seats×scans=50 → 20).
- churn 0 → `ltv = Infinity` con flag en `uncertainty`.

### 9.3 Test de coherencia
- `contributionMonthly === revenueMonthly − costToServeMonthly` en todos los escenarios (conservador/base/optimista, todos los tiers).

### 9.4 Test de procedencia
- toda constante `VERIFICADO` tiene `source` no vacío.
- toda constante `HIPOTESIS` tiene `editable === true`.

---

## 10. Integración mínima con la UI existente

- `pricing.tsx`: se elimina `compute()` inline y los arrays `PLANS` hardcodeados; pasa a importar
  tiers y a llamar `computeBuyerEconomics` / `scenarios` desde `@/lib/pricing`.
- `FinancialPanel.tsx`: consume KPIs del motor (no recalcula).
- Se añade tier **Enterprise** y un selector de cuenta ancla "White & Case" que precarga los seats/rate citados.
- Se añade el **panel de chat** mínimo.
- Se mantiene el diseño visual actual; solo cambia la **fuente de datos**. Se elimina la
  contradicción 0.43 vs 1/6 (única fuente de verdad).

---

## 11. Entregables (mapeo al formato del master prompt)

| Entregable del master prompt | Dónde |
|---|---|
| Tabla de supuestos (valor, unidad, etiqueta, fuente, fecha) | §3 + `constants.ts` |
| Diccionario de KPIs (nombre, fórmula, caso límite, lectura) | §5 |
| Especificación de funciones puras (firma, descripción, ejemplo resuelto) | §4 + §9.1 |
| Casos de prueba (con números esperados) | §9 + `__tests__/` |
| Contrato del chatbot | §8 |

Sin UI nueva más allá del panel de chat y el selector de cuenta ancla.

---

## 12. Fuera de alcance (YAGNI)

- Pasarela de pago / facturación real.
- Persistencia de escenarios del usuario.
- Streaming SSE del chatbot (v2).
- Implementación Python del endpoint `/api/chat` (vive en `main`; aquí solo el contrato).
- Rediseño estético de la página.

---

## 13. Riesgos y supuestos pendientes de validar

- `wcDisputesShare` (0.30) — fundamentado pero sin headcount firm-wide público. Editable.
- `pricePerSeatMonthly` (£100) — anclado a competidores (Clearbrief $300, Lexis ~$200, vLex ~$79; §3.6); validar con W&C vía piloto pagado.
- `cacEnterprise` (£40k) — anclado a benchmark legaltech (~£5k base; 6×–8× justificado por ciclo BigLaw); rango £5k–£60k editable. Ver KPI `minViableSeats`.
- `grossMargin` (~97%) — sobre el benchmark LLM-native (52–65%); defendible solo si el scan es low-token/cacheable. **Validar costo real LLM+API por scan en producción.**
- `directWastedCostsPerIncident` (£13.5k) — citado a Ayinde; `reputationalExposurePerIncident` queda editable.
- `fxUsdPerGbp`, `billableHoursPerLawyerYear` — re-verificar el día del pitch.
- Cifras de Stanford (17% / 34% / 58–82%) son snapshot 2024 — re-verificar antes del pitch.
