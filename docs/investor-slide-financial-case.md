# TraceIt — The financial case on one slide

> **Purpose:** everything an investor-judge needs to answer *"would you fund/back this?"* in a single lamina.
> **Scenario:** White & Case, **Division** capacity tier (793 disputes & arbitration lawyers), **conservative** stance.
> **Discipline:** every £ is either **VERIFIED** (external source) or **ASSUMPTION** (editable, shown live in the calculator). We never put a £ on anything we cannot measure. That rigor *is* the pitch — the same anti-hallucination standard the product applies to legal citations, applied to our own valuation.

---

## The slide (copy-ready layout)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TraceIt — what it costs White & Case to solve the AI-citation problem │
│  in-house, and what it returns.  (Division tier · 793 disputes lawyers)│
├──────────────────────────────┬────────────────────────────────────────┤
│  WHAT IT COSTS (at cost)      │   WHAT IT RETURNS (year 1)             │
│                               │                                        │
│  Build the engine — once      │      £2.57M  review time saved / yr    │
│    Graph + ingestion   £56k   │      ───────────────────────────       │
│    Verdict engine      £35k   │      Payback        1.2 months         │
│    Application         £45k   │      Year-1 net     £2.31M             │
│    QA + hardening      £14k   │      ROI year 1     907%               │
│    ── core build      £150k   │      3-year net     £7.38M             │
│                               │      Cost / firm rev  0.009%           │
│  Deploy at this capacity      │                                        │
│    Integration/SSO/train £70k │   ⚠ WHY NOW (not priced — strategic):  │
│    ── one-time total  £220k   │   Ayinde v Haringey [2025] EWHC 1383:  │
│                               │   £13.5k wasted costs + referral to    │
│  Run it — per year            │   regulator for fabricated citations.  │
│    AI API (19k scans)  £1.5k  │   Mata v Avianca [2023]: $5k sanction.  │
│    Infra (Neo4j/host)  £9.6k  │   This is the downside we remove —     │
│    Ops & maintenance   £24k   │   we never put a £ on reputation.      │
│    ── per year        £35k    │                                        │
│                               │                                        │
│  No licence. No margin. These are costs, not a price.                  │
├───────────────────────────────────────────────────────────────────────┤
│  VERIFIED (sourced) · W&C 2,643 lawyers, RPL $1.4M (Global Legal Post  │
│  FY2025) · Stanford RegLab 2024: Lexis+AI 17%, Westlaw AI 34%, general │
│  LLM 58% hallucination · ASSUMPTION (editable, shown live in calculator)│
└───────────────────────────────────────────────────────────────────────┘
```

---

## 1. The hero number (the only thing we measure)

> **£2.57M of review time saved per year — and it pays for itself in 1.2 months.**

That is the single quantified promise. Everything else (reputational risk, sanctions) is the **"why now" narrative**, never an invented figure. That discipline *is* the differentiator: most teams inflate intangible risk and lose credibility there.

---

## 2. The cost stack (bottom-up, not percentages)

### Build once — £150k
The engine is built **one time** and serves any capacity below it.

| Component | £ | Basis |
|---|---|---|
| Graph + ingestion (legislation.gov.uk + Neo4j case-law graph) | £56k | ~80 dev-days @ ~£700 |
| Verdict engine (deterministic existence / application / good-law checks) | £35k | ~50 dev-days |
| Application (FastAPI backend + frontend + audit trail) | £45k | ~65 dev-days |
| QA + security hardening | £14k | ~20 dev-days |
| **Core build total** | **£150k** | one-time, fixed |

### Deploy at Division capacity — £70k (one-time, scales with size)
Integration with DMS (iManage/NetDocuments) + SSO/SAML + data migration, client InfoSec review + third-party pen-test + DPA/data-residency, onboarding + train-the-trainer for 793 users + change management, and project management over the 8-week pilot.

> **Implementation total, year 1: £220k one-time** (£150k build + £70k deploy)

### Run — £35k/year (real COGS, no margin)

| Line | £/yr | Basis |
|---|---|---|
| AI API | £1.5k | 19,032 scans × £0.08/scan (Claude Haiku) |
| Infra (Neo4j Aura Pro + Railway + Cloudflare) | £9.6k | £800/mo × 12 |
| Ops & maintenance labor | £24k | £2,000/mo × 12 |
| **Maintenance total** | **£35k** | per year, at this capacity |

> **Year-1 cost = £220k + £35k = £255k**

---

## 3. The KPIs (all derived, all citable)

| KPI | Value | How it is computed |
|---|---|---|
| **Review time saved / yr** | £2,569,320 | 793 seats × 2 filings/mo × 1.5 h × 50% automation × £600/h × 30% realization × 12 |
| **Year-1 cost** | £255,123 | £220k build + deploy + £35k run |
| **Payback** | 1.2 months | £255k ÷ (£2.57M ÷ 12) |
| **Net · year 1** | £2,314,197 | £2.57M − £255k |
| **ROI · year 1** | 907% | net ÷ year-1 cost |
| **3-year net** | £7,382,592 | £2.57M × 3 − (£220k + £35k × 3) |
| **Cost as % of firm revenue** | 0.009% | £255k ÷ £2.91B (2,643 lawyers × $1.4M RPL ÷ 1.27 FX) |

**Closing line for this row:** solving this costs White & Case less than one-hundredth of one percent of revenue, and repays before the first quarter closes.

---

## 4. The citations (the credibility column)

### VERIFIED — external, real source
- **White & Case FY2025** — 2,643 lawyers; revenue-per-lawyer $1.4M → blended rate ≈ £600/h (Global Legal Post).
- **Stanford RegLab 2024** — the triple citation that resolves the "1-in-6 vs 0.43" contradiction:
  - Lexis+ AI hallucination **17%** (~1 in 6) — Magesh et al.
  - Westlaw AI hallucination **34%** (~1 in 3) — Magesh et al.
  - General-purpose LLM on legal queries **58%** — Dahl et al., *"Large Legal Fictions"* (arXiv:2401.01301).
- **Ayinde v Haringey [2025] EWHC 1383** — £2k+VAT wasted costs/lawyer + ~£7k client costs disallowed (**£13.5k** direct) + referral to the regulator for fabricated citations. The legal trigger behind "why now".
- **Mata v Avianca [2023]** — $5k sanction; the international precedent.

### ASSUMPTION — editable, shown live in the calculator
All dev-days, infra, ops figures and the automation / value-realization percentages. Judges can move the sliders and watch the model recompute **deterministically**. Editable ≠ weak — it is honesty made interactive.

---

## 5. The capacity tiers (cost scales with deployment size)

The same engine (£150k, built once) deploys at four sizes. Each tier = one-time deployment + annual maintenance, **at cost**.

| Tier | Max users | Max requests/mo | Deploy (one-time) | Run (per year) |
|---|---|---|---|---|
| Pilot — one practice group | 50 | 2,500 | £15k | ~£10k |
| Practice — a full practice area | 250 | 12,500 | £35k | ~£17k |
| **Division — disputes & arbitration (W&C)** | **800** | **40,000** | **£70k** | **~£35k** |
| Firm-wide — every lawyer | 2,643 | 130,000 | £120k | ~£59k |

---

## 6. Why this slide wins on "would you fund this?"

1. **One measurable promise** (£2.57M / 1.2-month payback) — not inflated with intangible risk.
2. **Bottom-up, defensible cost** — every £ has dev-days or a vendor behind it, not "10% of the licence".
3. **At cost, no margin** — coherent with *"we solve a problem the firm has"*, not *"we sell you SaaS"*.
4. **VERIFIED / ASSUMPTION provenance** — the product's rigor applied to the numbers: a judge cannot accuse us of inventing.
5. **The downside is narrative, not a number** — disciplined where most teams over-claim.

---

### Source of record
All figures above are computed by the deterministic pricing engine in `src/lib/pricing/` (constants in `constants.ts`, capacity tiers in `capacity.ts`, the case in `business-case.ts`). Re-verify FX and W&C financials on pitch day.

> **Disclaimer:** illustrative/analytical model, not a firm quote. TraceIt is decision support, not legal advice; the signing lawyer remains responsible for every authority cited.
