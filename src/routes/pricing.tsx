import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Strong ease-out curve (Emil): built-in easings are too weak for entrances.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
import {
  ArrowRight,
  Check,
  Calculator,
  Info,
  TrendingUp,
} from "lucide-react";
import { Nav, Closing, Footer } from "@/components/citationguard/SiteChrome";
import {
  formatGBP,
  formatMonths,
  formatPct,
  CONSTANTS,
  changedKeys,
  computeBusinessCase,
  CAPACITY_TIERS,
  computeCapacityCost,
  platformBuildTotal,
  CAPTURE_STANCES,
  matchStance,
  effectiveCapturePct,
  type CalculatorInputs,
  type CapacityTierId,
} from "@/lib/pricing";
import { ChatPanel } from "@/components/citationguard/ChatPanel";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "TraceIt pricing: your return" },
      {
        name: "description",
        content:
          "See what citation integrity returns before you pay for it. Put in your own filings, review hours and rate, and TraceIt shows your break-even, payback and margin in real time.",
      },
      { property: "og:title", content: "TraceIt pricing: your return" },
      {
        property: "og:description",
        content: "A pricing page that proves a return, not a cost. Run your own numbers.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PricingPage,
});

function PlanCards() {
  const platform = platformBuildTotal();
  return (
    <div>
      {/* Platform build — one-time, serves any capacity below */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-n300 bg-surface px-6 py-5">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-widest text-action">
            Platform build · one-time
          </p>
          <p className="mt-1 text-sm text-n500">
            The engine — citation graph, legislation.gov.uk ingestion, deterministic verdict logic
            — built <span className="text-ink">once</span> and shared by every capacity below.
          </p>
        </div>
        <span className="font-display text-3xl font-semibold text-ink">{formatGBP(platform)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {CAPACITY_TIERS.map((t) => {
          const cost = computeCapacityCost(t);
          const facts = [
            `Up to ${t.maxUsers.toLocaleString()} lawyers`,
            `Up to ${t.maxRequestsMonth.toLocaleString()} scans/mo`,
            "Existence + application + good-law checks",
            "Audit trail hash on every report",
          ];
          return (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-2xl p-7 transition-[transform,border-color] duration-200 hover:-translate-y-1 ${
                t.featured
                  ? "border-2 border-ink bg-ink text-paper shadow-2xl shadow-ink/20 lg:-mt-4 lg:mb-4"
                  : "border border-n300 bg-surface hover:border-ink-300"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-accent-lime px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink">
                  White &amp; Case
                </span>
              )}
              <h3
                className={`font-display text-xl font-semibold ${t.featured ? "text-paper" : "text-ink"}`}
              >
                {t.name}
              </h3>
              <p className={`mt-2 text-sm ${t.featured ? "text-paper/70" : "text-n500"}`}>
                {t.forWho}
              </p>
              <div className="mt-5">
                <div className="flex items-baseline gap-1">
                  <span
                    className={`font-display text-3xl font-semibold ${t.featured ? "text-accent-lime" : "text-ink"}`}
                  >
                    {formatGBP(cost.deployment)}
                  </span>
                  <span className={`text-sm ${t.featured ? "text-paper/60" : "text-n500"}`}>
                    deploy
                  </span>
                </div>
                <p className={`mt-1 text-sm ${t.featured ? "text-paper/70" : "text-n500"}`}>
                  + {formatGBP(cost.maintenanceAnnual)}/yr to run
                </p>
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {facts.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${t.featured ? "text-accent-lime" : "text-action"}`}
                    />
                    <span className={t.featured ? "text-paper/90" : "text-ink"}>{f}</span>
                  </li>
                ))}
              </ul>
              <p
                className={`mt-6 font-mono text-[10px] uppercase tracking-wide ${t.featured ? "text-paper/40" : "text-n500"}`}
              >
                At cost · no licence, no margin
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  highlight,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div className="relative rounded-lg">
      {/* Flash ring on apply — the ring (box-shadow) is static; only its opacity
          animates, so the highlight stays on the compositor instead of repainting. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent-lime transition-opacity duration-300 ${
          highlight ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-ink">{label}</label>
        <span className="font-mono text-sm text-ink">
          {prefix}
          {value}
          {suffix}
        </span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-n500">{hint}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-action"
      />
    </div>
  );
}

function ReturnCalculator({
  capacityTier,
  setCapacityTier,
}: {
  capacityTier: CapacityTierId;
  setCapacityTier: (id: CapacityTierId) => void;
}) {
  const [filings, setFilings] = useState(2);
  const [hoursPerFiling, setHoursPerFiling] = useState(1.5);
  const [rate, setRate] = useState(600);
  const [automation, setAutomation] = useState(50);
  const [seats, setSeats] = useState(793);
  const [realization, setRealization] = useState(30);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedTier = CAPACITY_TIERS.find((t) => t.id === capacityTier) ?? CAPACITY_TIERS[0];

  const calcInputs: CalculatorInputs = {
    capacityTier,
    seats,
    filingsPerMonth: filings,
    hoursPerFiling,
    blendedRate: rate,
    automationPct: automation,
    valueRealizationPct: realization,
  };
  const bc = computeBusinessCase(calcInputs);

  // "Time captured" readout: the two honesty knobs collapsed into one figure.
  const effPct = effectiveCapturePct(automation, realization);
  const savedPerFiling = hoursPerFiling * rate * effPct;
  const activeStance = matchStance(automation, realization);
  const stanceNote =
    CAPTURE_STANCES.find((s) => s.id === activeStance)?.note ??
    "Custom, fine-tuned to your own numbers.";

  // Apply LLM-proposed inputs to the sliders and briefly flash what moved.
  // The engine recomputes every output reactively — the model never sets a result.
  const onApplyInputs = (nextInputs: CalculatorInputs) => {
    const moved = changedKeys(calcInputs, nextInputs);
    setCapacityTier(nextInputs.capacityTier);
    setSeats(nextInputs.seats);
    setFilings(nextInputs.filingsPerMonth);
    setHoursPerFiling(nextInputs.hoursPerFiling);
    setRate(nextInputs.blendedRate);
    setAutomation(nextInputs.automationPct);
    setRealization(nextInputs.valueRealizationPct);
    setHighlight(moved as string[]);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlight([]), 1600);
  };

  return (
    <div>
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="rounded-2xl border border-n300 bg-surface p-7">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-action">
          <Calculator className="h-4 w-4" /> Your numbers
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {CAPACITY_TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCapacityTier(t.id)}
              className={`relative rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                t.id === capacityTier
                  ? "border-transparent text-paper"
                  : "border-n300 text-n500 hover:border-ink"
              }`}
            >
              {t.id === capacityTier && (
                <motion.span
                  layoutId="pricing-plan-pill"
                  className="absolute inset-0 rounded-lg bg-ink"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10">{t.name}</span>
            </button>
          ))}
        </div>

        {/* White & Case preset */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setCapacityTier("division");
              setSeats(793);
              setRate(600);
              setFilings(2);
              setHoursPerFiling(1.5);
              setAutomation(50);
              setRealization(30);
            }}
            className="rounded-lg border border-action px-3 py-1.5 text-xs font-semibold text-action"
          >
            Load the White &amp; Case preset
          </button>
        </div>

        <div className="mt-7 space-y-7">
          <Field
            label="Lawyers"
            hint={`How many lawyers use it. ${selectedTier.name} covers up to ${selectedTier.maxUsers.toLocaleString()}.`}
            value={seats}
            onChange={setSeats}
            min={1}
            max={selectedTier.maxUsers}
            step={1}
            highlight={highlight.includes("seats")}
          />
          <Field
            label="Filings per month"
            hint="Skeleton arguments / pleadings you run through review."
            value={filings}
            onChange={setFilings}
            min={1}
            max={120}
            step={1}
            highlight={highlight.includes("filingsPerMonth")}
          />
          <Field
            label="Hours checking citations per filing"
            hint="Manual time spent verifying authorities today."
            value={hoursPerFiling}
            onChange={setHoursPerFiling}
            min={0.5}
            max={8}
            step={0.5}
            suffix=" h"
            highlight={highlight.includes("hoursPerFiling")}
          />
          <Field
            label="Blended hourly rate"
            hint="What an hour of that reviewer's time is worth."
            value={rate}
            onChange={setRate}
            min={40}
            max={600}
            step={10}
            prefix="£"
            highlight={highlight.includes("blendedRate")}
          />
          {/* Time captured: pick a posture instead of guessing two numbers */}
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium text-ink">Time captured</label>
              <span className="font-mono text-sm text-ink">
                ≈{Math.round(effPct * 100)}% · {formatGBP(savedPerFiling)}/filing
              </span>
            </div>
            <p className="mt-0.5 text-xs text-n500">
              How much review time TraceIt removes, and how much of it turns into billed money. Pick a
              posture instead of estimating two percentages.
            </p>

            <div className="mt-2 inline-flex rounded-lg border border-n300 bg-surface p-0.5">
              {CAPTURE_STANCES.map((s) => {
                const active = activeStance === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setAutomation(s.automationPct);
                      setRealization(s.valueRealizationPct);
                    }}
                    aria-pressed={active}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      active ? "bg-ink text-paper" : "text-n500 hover:text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-n500">{stanceNote}</p>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-2 text-xs font-semibold text-action hover:underline"
            >
              {showAdvanced ? "Hide advanced" : "Advanced: fine-tune the two knobs"}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-7 border-l-2 border-n300 pl-4">
                <Field
                  label="Honesty knob: time TraceIt actually removes"
                  hint="Be conservative. It assists review; it doesn't replace your sign-off."
                  value={automation}
                  onChange={setAutomation}
                  min={20}
                  max={100}
                  step={5}
                  suffix="%"
                  highlight={highlight.includes("automationPct")}
                />
                <Field
                  label="Realization: % of saved hours that turn into £"
                  hint="Only counts if those hours are re-billed or free up billable capacity."
                  value={realization}
                  onChange={setRealization}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  highlight={highlight.includes("valueRealizationPct")}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live result — cost to solve (TCO) vs time saved */}
      <div className="flex flex-col rounded-2xl border-2 border-ink bg-ink p-7 text-paper">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent-lime">
          <TrendingUp className="h-4 w-4" /> {selectedTier.name} · your numbers
        </div>
        <p className="mt-1 text-xs text-paper/50">
          {bc.seats.toLocaleString()} lawyers · ~{Math.round(bc.requestsPerYear).toLocaleString()}{" "}
          scans/yr · ≈{formatPct(bc.year1CostPctOfFirmRevenue, 2)} of firm revenue
        </p>

        {/* Review time saved — the only thing we measure */}
        <div className="mt-4 rounded-xl bg-ink-700 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-paper/40">
            Review time saved / yr
          </p>
          <p className="mt-1 font-display text-4xl font-semibold text-accent-lime">
            {formatGBP(bc.timeSavedAnnual)}
          </p>
          <p className="mt-1 text-xs text-paper/60">
            The only value we put a number on — measured from your own hours.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Metric label="Cost · year 1" value={formatGBP(bc.year1Cost)} />
          <Metric label="Net · year 1" value={formatGBP(bc.year1Net)} highlight={bc.year1Net >= 0} />
          <Metric
            label="Payback"
            value={bc.paybackMonths !== null ? formatMonths(bc.paybackMonths) : "—"}
          />
          <Metric label="3-year net" value={formatGBP(bc.threeYearNet)} />
        </div>

        {/* Cost build-up — at cost, no margin: build it + run it */}
        <button
          type="button"
          onClick={() => setShowCostBreakdown((v) => !v)}
          className="mt-4 text-xs font-semibold text-accent-lime hover:underline"
        >
          {showCostBreakdown ? "Hide cost build-up" : "Cost build-up — at cost, what it takes to build + run it"}
        </button>
        {showCostBreakdown && (
          <div className="mt-3 space-y-1 rounded-xl bg-ink-700/50 p-4 text-xs text-paper/70">
            <p className="font-semibold text-paper/90">
              Build the solution (one-time) — {formatGBP(bc.implementation.total)}
            </p>
            <div className="flex justify-between"><span>· Graph + legislation.gov.uk ingestion</span><span className="font-mono">{formatGBP(bc.implementation.coreBuild.graphIngestion)}</span></div>
            <div className="flex justify-between"><span>· Deterministic verdict engine</span><span className="font-mono">{formatGBP(bc.implementation.coreBuild.verdictEngine)}</span></div>
            <div className="flex justify-between"><span>· Backend + frontend + audit trail</span><span className="font-mono">{formatGBP(bc.implementation.coreBuild.app)}</span></div>
            <div className="flex justify-between"><span>· Testing + security hardening</span><span className="font-mono">{formatGBP(bc.implementation.coreBuild.qaHardening)}</span></div>
            <div className="flex justify-between pt-1"><span>· Deploy at {selectedTier.name} (integration + InfoSec + training)</span><span className="font-mono">{formatGBP(bc.implementation.deployment)}</span></div>
            <p className="pt-2 font-semibold text-paper/90">
              Run it (per year) — {formatGBP(bc.maintenanceAnnual)}
            </p>
            <div className="flex justify-between"><span>· AI API ({Math.round(bc.requestsPerYear).toLocaleString()} scans)</span><span className="font-mono">{formatGBP(bc.runCost.llmApiAnnual)}</span></div>
            <div className="flex justify-between"><span>· Hosting/infra (Neo4j + backend + CDN)</span><span className="font-mono">{formatGBP(bc.runCost.infraAnnual)}</span></div>
            <div className="flex justify-between"><span>· Ops &amp; maintenance</span><span className="font-mono">{formatGBP(bc.runCost.opsAnnual)}</span></div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-paper/40">
          At cost — no licence, no margin. ⚠ Why now (not priced): the sanction wave — Ayinde [2025]{" "}
          ({formatGBP(bc.sanctionDirectCost)} wasted costs), Mata v Avianca [2023].
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-lime px-5 py-3 text-sm font-semibold text-ink transition hover:opacity-90 active:scale-[0.97]"
          >
            Start my first scan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper active:scale-[0.97]"
          >
            Talk to the team
          </Link>
        </div>
      </div>
    </div>

    <ChatPanel inputs={calcInputs} onApplyInputs={onApplyInputs} />
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-ink-700 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-paper/40">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          highlight ? "text-accent-lime" : "text-paper"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DemandSection() {
  return (
    <section className="border-y border-n300/70 bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-20 text-paper">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent-lime">
            Why the spend holds up
          </p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            The margin is there because the downside is enormous.
          </h2>
          <p className="mt-4 text-lg text-paper/70">
            You don&rsquo;t pay TraceIt against zero. You pay it against the cost of one bad
            authority reaching the court. That is what makes a few hundred pounds a month an easy
            call.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">
              {Math.round(CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.value * 100)}–
              {Math.round(CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE.value * 100)}%
            </p>
            <p className="mt-3 text-sm text-paper/80">
              hallucination rate in legal AI tools: Lexis+ AI ({Math.round(CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.value * 100)}%)
              and Westlaw AI ({Math.round(CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE.value * 100)}%) in independent Stanford testing.
              General LLMs reach {Math.round(CONSTANTS.GENERAL_LLM_HALLUCINATION_RATE.value * 100)}%+ on legal citations.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              Verified · Stanford RegLab 2024
            </p>
          </div>
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">CPR r.44.11</p>
            <p className="mt-3 text-sm text-paper/80">
              wasted-costs exposure for putting bad authority before the court.{" "}
              <strong>Ayinde v Haringey [2025] EWHC 1383</strong>: court sanctioned AI-fabricated
              citations, triggering SRA/BSB referrals. Direct wasted costs:{" "}
              {formatGBP(CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT.value)} per incident,
              with reputational exposure on top.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              Verified · Civil Procedure Rules · Ayinde [2025] EWHC 1383
            </p>
          </div>

          {/* TraceIt's answer, broken out wide so the "0" lands as the resolution
              to the two risks above, not a third equal stat in the row. */}
          <div className="flex flex-col gap-5 rounded-2xl border-2 border-accent-lime/40 bg-ink-700 p-7 sm:col-span-2 sm:flex-row sm:items-center">
            <p className="font-display text-6xl font-semibold leading-none text-accent-lime sm:text-7xl">
              0
            </p>
            <div className="sm:border-l sm:border-paper/15 sm:pl-6">
              <p className="text-base text-paper/80">
                hallucinated existence verdicts, because deterministic lookup returns only what the
                corpus holds.
              </p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-paper/40">
                By construction
              </p>
            </div>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-sm text-paper/60">
          One wasted-costs order, or one filing discredited in front of a judge, dwarfs a year of
          subscription. The calculator above only counts review hours. The risk avoided is on top.
        </p>
      </div>
    </section>
  );
}

function Honesty() {
  const rows = [
    {
      label: "Plan prices",
      status: "Verified",
      note: "The figures on the plan cards are the prices you pay.",
    },
    {
      label: "Infrastructure costs",
      status: "Estimated",
      note: "Corpus/infra costs shown per plan are our real internal estimates, absorbed into price.",
    },
    {
      label: `Hallucination rates (${Math.round(CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.value * 100)}–${Math.round(CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE.value * 100)}%) & CPR r.44.11`,
      status: "Verified",
      note: `Cited to ${CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.source} and ${CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE.source} respectively. Wasted costs figure from ${CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT.source}.`,
    },
    {
      label: "Calculator outputs",
      status: "Illustrative",
      note: "Everything in the calculator is driven by your editable inputs. It is a simulation, not a quote.",
    },
  ];
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-widest text-action">
        Where others hide, we label
      </p>
      <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        What&rsquo;s verified, what&rsquo;s estimated, what&rsquo;s illustrative.
      </h2>
      <p className="mt-4 text-lg text-n500">
        Pricing is where you should trust least. So we name every assumption rather than dress a
        number up as a guarantee.
      </p>
      <dl className="mt-8 divide-y divide-n100">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-start sm:gap-4">
            <dt className="flex items-center gap-2 sm:w-72 sm:shrink-0">
              <Info className="h-4 w-4 shrink-0 text-action" aria-hidden="true" />
              <span className="font-display text-sm font-semibold text-ink">{r.label}</span>
            </dt>
            <dd className="text-sm text-n500">
              <span className="mr-2 rounded-md border border-n300 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink">
                {r.status}
              </span>
              {r.note}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 rounded-xl border border-n300 bg-surface p-5 text-sm text-n500">
        This page is illustrative, not a quote. TraceIt is decision support, not legal
        advice. The signing advocate remains responsible for every authority.
      </p>
    </section>
  );
}

function PricingPage() {
  const [capacityTier, setCapacityTier] = useState<CapacityTierId>("division");
  const reduce = useReducedMotion();

  return (
    <main className="relative min-h-dvh">
      <Nav current="pricing" />

      {/* 1. Value frame header */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="max-w-3xl"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-action">
            Cost to solve
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            Build it once. Run it for the{" "}
            <span className="mark-lime">cost of the servers.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-n500">
            No licence, no margin: this is what it costs your firm to build the engine once, then
            deploy and run it at the capacity you need. The calculator below uses your own numbers
            to show what it saves against manual review.
          </p>
        </motion.div>
      </section>

      {/* 2. Capacity tiers — cost to deploy + run */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <PlanCards />
      </section>

      {/* 3. Return calculator */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Run your own numbers.
          </h2>
          <p className="mt-4 text-lg text-n500">
            Pick a plan, put in your filings, your review hours and your rate. The figure that
            matters is the one you generate, including a conservative scenario, because we&rsquo;d
            rather under-promise.
          </p>
        </div>
        <div className="mt-10">
          <ReturnCalculator capacityTier={capacityTier} setCapacityTier={setCapacityTier} />
        </div>
      </section>

      {/* 4. Why it's paid — the demand side */}
      <DemandSection />

      {/* 5. Honesty / fine print */}
      <Honesty />

      {/* 6 + 7. Shared bookend + footer */}
      <Closing />
      <Footer />
    </main>
  );
}
