import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
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
  TIERS_LIST,
  TIERS,
  computeBuyerEconomics,
  computeSellerEconomics,
  buyerScenarios,
  sellerScenarios,
  formatGBP,
  CONSTANTS,
  toBuyerInputs,
  toSellerInputs,
  changedKeys,
  type CalculatorInputs,
  type TierId,
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

function PlanCards({
  annual,
  onChoose,
}: {
  annual: boolean;
  onChoose: (id: TierId) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {TIERS_LIST.map((p) => {
        const price = p.pricePerSeatMonthly
          ? p.pricePerSeatMonthly.value
          : annual
            ? p.priceMonthly!.value * p.annualFactor.value
            : p.priceMonthly!.value;
        const priceSuffix = p.pricePerSeatMonthly
          ? "/seat/mo"
          : annual
            ? "/mo · annual"
            : "/mo";

        const capacityLine = p.scanCapacity
          ? `Up to ${p.scanCapacity.value} scans/mo`
          : `Fair-use ${p.scanCapacityPerSeat!.value} scans/seat/mo`;

        const facts = [
          capacityLine,
          "Existence + application + good-law checks",
          "Audit trail hash on every report",
        ];

        return (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-2xl p-7 ${
              p.featured
                ? "border-2 border-ink bg-ink text-paper shadow-2xl shadow-ink/20 lg:-mt-4 lg:mb-4"
                : "border border-n300 bg-surface"
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-7 rounded-full bg-accent-lime px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink">
                Recommended
              </span>
            )}
            <h3
              className={`font-display text-xl font-semibold ${
                p.featured ? "text-paper" : "text-ink"
              }`}
            >
              {p.name}
            </h3>
            <p className={`mt-2 text-sm ${p.featured ? "text-paper/70" : "text-n500"}`}>
              {p.forWho}
            </p>
            <div className="mt-5 flex items-baseline gap-1">
              <span
                className={`font-display text-4xl font-semibold ${
                  p.featured ? "text-accent-lime" : "text-ink"
                }`}
              >
                {formatGBP(price)}
              </span>
              <span className={`text-sm ${p.featured ? "text-paper/60" : "text-n500"}`}>
                {priceSuffix}
              </span>
            </div>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {facts.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      p.featured ? "text-accent-lime" : "text-action"
                    }`}
                  />
                  <span className={p.featured ? "text-paper/90" : "text-ink"}>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onChoose(p.id)}
              className={`mt-7 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition active:scale-[0.97] ${
                p.featured
                  ? "bg-accent-lime text-ink hover:opacity-90"
                  : "bg-ink text-paper hover:bg-ink-700"
              }`}
            >
              <Calculator className="h-4 w-4" /> Calculate my return
            </button>
          </div>
        );
      })}
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
    <div
      className={`rounded-lg transition-shadow duration-300 ${
        highlight ? "shadow-[0_0_0_2px_var(--color-accent-lime,#bef264)]" : ""
      }`}
    >
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
  planId,
  setPlanId,
  annual,
  setAnnual,
}: {
  planId: TierId;
  setPlanId: (id: TierId) => void;
  annual: boolean;
  setAnnual: (v: boolean) => void;
}) {
  const [filings, setFilings] = useState(12);
  const [hoursPerFiling, setHoursPerFiling] = useState(2.5);
  const [rate, setRate] = useState(180);
  const [automation, setAutomation] = useState(65);
  const [seats, setSeats] = useState(793);
  const [realization, setRealization] = useState(50);
  const [highlight, setHighlight] = useState<string[]>([]);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tier = TIERS[planId];

  const calcInputs: CalculatorInputs = {
    tier: planId,
    billingCycle: annual ? "annual" : "monthly",
    seats,
    filingsPerMonth: filings,
    hoursPerFiling,
    blendedRate: rate,
    automationPct: automation,
    valueRealizationPct: realization,
  };
  const inputs = toBuyerInputs(calcInputs);

  // Apply LLM-proposed inputs to the sliders and briefly flash what moved.
  // The engine recomputes every output reactively — the model never sets a result.
  const onApplyInputs = (nextInputs: CalculatorInputs) => {
    const moved = changedKeys(calcInputs, nextInputs);
    setPlanId(nextInputs.tier);
    setAnnual(nextInputs.billingCycle === "annual");
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

  const eco = useMemo(
    () => computeBuyerEconomics(inputs, tier),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, seats, filings, hoursPerFiling, rate, automation, realization, annual],
  );

  const scen = useMemo(
    () => buyerScenarios(inputs, tier),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, seats, filings, hoursPerFiling, rate, automation, realization, annual],
  );

  const sellerInputs = toSellerInputs(calcInputs);

  const sellerEco = useMemo(
    () => computeSellerEconomics(sellerInputs, tier),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, seats, filings, annual],
  );

  const sellerScen = useMemo(
    () => sellerScenarios(sellerInputs, tier),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, seats, filings, annual],
  );

  const displayedRoi =
    eco.buyerRoiPct !== null && eco.buyerRoiPct >= 0
      ? `${Math.round(eco.buyerRoiPct * 100)}%`
      : "—";

  return (
    <div>
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="rounded-2xl border border-n300 bg-surface p-7">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-action">
          <Calculator className="h-4 w-4" /> Your numbers
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIERS_LIST.map((p) => {
            const tierPrice = p.pricePerSeatMonthly
              ? p.pricePerSeatMonthly.value
              : annual
                ? p.priceMonthly!.value * p.annualFactor.value
                : p.priceMonthly!.value;
            const priceSuffix = p.pricePerSeatMonthly ? "/seat" : "/mo";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanId(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  p.id === planId
                    ? "border-ink bg-ink text-paper"
                    : "border-n300 text-n500 hover:border-ink"
                }`}
              >
                {p.name} · {formatGBP(tierPrice)}{priceSuffix}
              </button>
            );
          })}
        </div>

        {/* White & Case preset */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setPlanId("enterprise");
              setSeats(793);
              setRate(600);
              setFilings(3);
              setHoursPerFiling(2.5);
              setAutomation(65);
              setRealization(50);
            }}
            className="rounded-lg border border-action px-3 py-1.5 text-xs font-semibold text-action"
          >
            Load the White &amp; Case preset
          </button>
        </div>

        <div className="mt-7 space-y-7">
          {planId === "enterprise" && (
            <Field
              label="Lawyers (seats)"
              hint="Number of firm seats on TraceIt."
              value={seats}
              onChange={setSeats}
              min={1}
              max={2643}
              step={1}
              highlight={highlight.includes("seats")}
            />
          )}
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
      </div>

      {/* Live result */}
      <div className="flex flex-col rounded-2xl border-2 border-ink bg-ink p-7 text-paper">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent-lime">
          <TrendingUp className="h-4 w-4" /> Your return, live
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Metric label="Hours saved / mo" value={`${eco.hoursSavedMonthly.toFixed(1)} h`} />
          <Metric label="Time value / mo" value={formatGBP(eco.realizedTimeValueMonthly)} />
          <Metric label="Plan cost / mo" value={formatGBP(eco.effectiveLicenseMonthly)} />
          <Metric
            label="Net benefit / mo"
            value={formatGBP(eco.netBenefitMonthly)}
            highlight={eco.netBenefitMonthly >= 0}
          />
        </div>
        <div className="mt-5 rounded-xl bg-ink-700 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-paper/70">Return on the plan</span>
            <span className="font-display text-3xl font-semibold text-accent-lime">
              {displayedRoi}
            </span>
          </div>
          <p className="mt-2 text-sm text-paper/70">
            Break-even at{" "}
            <span className="font-mono text-paper">
              {Number.isFinite(eco.buyerBreakEvenFilings)
                ? eco.buyerBreakEvenFilings
                : "—"}
            </span>{" "}
            filings/month. You scan {filings}.
          </p>
        </div>

        {/* Sensitivity */}
        <div className="mt-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-paper/40">
            Sensitivity: net benefit / mo
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Scenario name="Conservative" value={formatGBP(scen.conservative.netBenefitMonthly)} />
            <Scenario name="Base" value={formatGBP(scen.base.netBenefitMonthly)} featured />
            <Scenario name="Optimistic" value={formatGBP(scen.optimistic.netBenefitMonthly)} />
          </div>
        </div>

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

function Scenario({
  name,
  value,
  featured,
}: {
  name: string;
  value: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        featured ? "bg-accent-lime text-ink" : "bg-ink-700 text-paper"
      }`}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide opacity-70">{name}</p>
      <p className="mt-1 font-display text-base font-semibold">{value}</p>
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
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">
              {Math.round(CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.value * 100)}–
              {Math.round(CONSTANTS.WESTLAW_AI_HALLUCINATION_RATE.value * 100)}%
            </p>
            <p className="mt-3 text-sm text-paper/80">
              hallucination rate in legal AI tools — Lexis+ AI ({Math.round(CONSTANTS.LEGAL_RAG_HALLUCINATION_RATE.value * 100)}%)
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
              {formatGBP(CONSTANTS.DIRECT_WASTED_COSTS_PER_INCIDENT.value)} per incident —
              reputational exposure on top.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              Verified · Civil Procedure Rules · Ayinde [2025] EWHC 1383
            </p>
          </div>
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">0</p>
            <p className="mt-3 text-sm text-paper/80">
              hallucinated existence verdicts, because deterministic lookup returns only what the
              corpus holds.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              By construction
            </p>
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
  const [annual, setAnnual] = useState(true);
  const [planId, setPlanId] = useState<TierId>("chambers");
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
            Investment &amp; return
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            Recover the month&rsquo;s cost on the{" "}
            <span className="mark-lime">first filing you check.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-n500">
            Below is the honest version: real plan prices, the infra cost behind each, and a
            calculator that uses your numbers, not ours, to show your break-even, payback and
            margin. You compare the price against what you save, not against zero.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-n300 bg-surface p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              !annual ? "bg-ink text-paper" : "text-n500"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              annual ? "bg-ink text-paper" : "text-n500"
            }`}
          >
            Annual <span className="text-accent-lime">−20%</span>
          </button>
        </div>
      </section>

      {/* 2. Plans */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <PlanCards annual={annual} onChoose={setPlanId} />
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
          <ReturnCalculator planId={planId} setPlanId={setPlanId} annual={annual} setAnnual={setAnnual} />
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
