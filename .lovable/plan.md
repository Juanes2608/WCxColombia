# CitationGuard — Frontend Build Plan

Building the full frontend for **CitationGuard**, a legal-citation integrity checker. Two pages: an upload landing and a forensic results dashboard. Brand is the "Forensic" system (near-black + acid lime). Name and logo stay as swappable placeholders.

## Stack reality (important)

The master prompt assumes **Next.js 14 + App Router**. This project runs on **TanStack Start (React 19) + Tailwind v4 + shadcn/ui**. I will faithfully reproduce every brand and legal-design requirement, adapting only the framework mechanics:

| Master prompt (Next.js) | This project (TanStack Start) |
|---|---|
| `app/page.tsx` | `src/routes/index.tsx` |
| `app/results/[matterId]/page.tsx` | `src/routes/results.$matterId.tsx` |
| `NEXT_PUBLIC_API_URL` + real backend | Local **mock data layer** (chosen) |
| `sessionStorage` handoff | Same `sessionStorage` key `result-${matter_id}` |
| `reactflow` graph | Deferred/optional (only if requested) |

Data: a mock client in `src/lib/api-client.ts` returns realistic `VerifyResult` payloads matching §3 shapes. It is isolated so swapping to a real API later is a one-file change.

## Tokens (mapped to brand manual)
- Core: `--ink #14181A`, `--accent #C6F035` (lime, scanner signal only), `--action #5F8C00`, `--bg #F6F7F2`, `--surface #FFFFFF`, neutrals n100–n700.
- Verdict (semantic only, always icon+label+colour): good `#166534`/bg `#E7F4EC`, warn `#92400E`/bg `#FBF1E3`, bad `#B91C1C`/bg `#FBEAEA`, unk `#4B4F49`/bg `#ECEFE6`.
- Fonts via `@fontsource`: Space Grotesk (display), Inter (UI/body), JetBrains Mono (machine facts).

---

## Phase 1 — Design system, components, upload page

1. **Tokens + fonts**: install `@fontsource/space-grotesk`, `@fontsource/inter`, `@fontsource/jetbrains-mono`; wire all tokens into `src/styles.css` `@theme` (oklch where the system requires, hex preserved as raw values for verdict tokens). Map verdict colours as semantic Tailwind tokens.
2. **`lib/types.ts`**: define `VerifyResult`, `CitationResult`, `FinancialSummary`, etc. exactly per §3.
3. **`lib/api-client.ts`**: mock `verifyCitations(file)`, `healthCheck()`, `ApiError`; returns a varied sample report (fabricated/misapplied/verified/overruled/not-checked rows) so the dashboard demonstrates all states.
4. **`lib/verdict-map.ts`**: single source of truth mapping verdict → icon + label + colour token + tooltip copy.
5. **Core components**: `Logo` (swappable `iso`/`wordmark`, inline SVG placeholder), `VerdictBadge` (R2/R9), `ConfidenceMeter` (R7, banded), `ScopeBanner` (R10), `DegradedNotice` (R1).
6. **Upload page** (`src/routes/index.tsx`): centered full-height, no nav; wordmark + brand headline; drag-and-drop accepting `.pdf,.txt` ≤20 MB with client-side validation; lime drag-over state; loading spinner ("Scanning citations against the corpus…"); plain error banners (400/413/500); first-class deterministic-lookup eyebrow (R5); on success store to `sessionStorage` and navigate to `/results/$matterId`.

**Review checkpoint** before Phase 2.

---

## Phase 2 — Results dashboard

Route `src/routes/results.$matterId.tsx` reads `sessionStorage`; expired/missing → calm empty state linking home.

1. **Top bar** — iso logo, mono `matter_id`, mono `processing_ms`, black "New document" action.
2. **Degraded banner (R1)** — only when health degraded.
3. **Headline hero (R4 + R5)** — dominant dark verdict band: consequential sentence (N fabricated / calm all-clear), deterministic-lookup trust chip, action panel (risk exposure avoided red, time saved green, flag rate vs 43% baseline).
4. **Summary chips (R2)** — Total / Fabricated / Misapplied / Verified, secondary to hero.
5. **Main split** — `CitationTable` (2/3) + side rail (`FinancialPanel` + audit-hash card) (1/3).
6. **Scope banner (R10)** at foot.

Components:
- **`CitationTable`** — columns #, Citation (mono+descriptor), Authenticity (badge + ConfidenceMeter), Still good law?, Type; plain-language header sub-labels (R6); sort FABRICATED-first; filter All/Flagged/Verified with counts and `aria-pressed`; rows keyboard-operable → detail.
- **`CitationDetail`** — focus-trapped drawer: Authenticity (explanation, claims-vs-actually-says for MISAPPLIED, ConfidenceMeter + band note, Scope-of-search for FABRICATED R8); Still good law? (`TreatmentTimeline` / good-law / not-checked); Statutory (excerpt + black underlined `source_url`, timeout grey state); LLM advisory card (lime-family, deterministic disclaimer).
- **`TreatmentTimeline`**, **`FinancialPanel`** (sources footnote + "computed deterministically — not LLM-generated").
- GraphViewer: only built if you want it (requires `reactflow`); otherwise omitted.

Close each phase against the §8 Definition of Done checklist (R1–R11 + brand).

---

## Technical notes
- All verdict styling flows through `verdict-map.ts` — no colour-only meaning anywhere.
- External links: black, underlined, never blue. Buttons: forensic black. Lime only as scanner/highlighter.
- Machine facts (verdicts, confidence, hashes, node IDs, citations, timings) rendered in JetBrains Mono.
- WCAG AA: verified token values, visible focus rings (lime on dark, ink on light), ≥44px targets.
- Out of scope: auth, persistence, history, accounts, payments, server-side fetching.

I'll start with Phase 1 once you approve.