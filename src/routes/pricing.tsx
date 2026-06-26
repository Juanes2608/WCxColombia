import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Calculator,
  ShieldCheck,
  Info,
  TrendingUp,
} from "lucide-react";
import { Nav, Closing, Footer } from "@/components/citationguard/SiteChrome";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Your return — CitationGuard pricing" },
      {
        name: "description",
        content:
          "See what citation integrity returns before you pay for it. Put in your own filings, review hours and rate, and CitationGuard shows your break-even, payback and margin in real time.",
      },
      { property: "og:title", content: "Your return — CitationGuard pricing" },
      {
        property: "og:description",
        content: "A pricing page that proves a return, not a cost. Run your own numbers.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PricingPage,
});

const GBP = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

type PlanId = "junior" | "chambers" | "firm";

const PLANS: {
  id: PlanId;
  name: string;
  forWho: string;
  monthly: number;
  annual: number;
  facts: string[];
  featured?: boolean;
}[] = [
  {
    id: "junior",
    name: "Junior advocate",
    forWho: "One barrister checking their own filings.",
    monthly: 49,
    annual: 39,
    facts: [
      "Up to 20 skeleton scans / month",
      "Existence + application + good-law checks",
      "Audit trail hash on every report",
      "Corpus infra cost: ~£6/mo, absorbed",
    ],
  },
  {
    id: "chambers",
    name: "Chambers",
    forWho: "A set sharing review standards across counsel.",
    monthly: 290,
    annual: 232,
    featured: true,
    facts: [
      "Up to 200 scans / month, pooled across seats",
      "Shared treatment timelines + coverage flags",
      "Clio case-treatment integration",
      "Corpus infra cost: ~£40/mo, absorbed",
    ],
  },
  {
    id: "firm",
    name: "Firm / scale",
    forWho: "Litigation teams filing at volume.",
    monthly: 950,
    annual: 760,
    facts: [
      "Unlimited scans, fair-use throttling",
      "SSO, per-matter access controls",
      "Priority corpus refresh + SLA",
      "Dedicated infra, usage reported monthly",
    ],
  },
];

function PlanCards({
  annual,
  onChoose,
}: {
  annual: boolean;
  onChoose: (id: PlanId) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {PLANS.map((p) => {
        const price = annual ? p.annual : p.monthly;
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
                {GBP(price)}
              </span>
              <span className={`text-sm ${p.featured ? "text-paper/60" : "text-n500"}`}>
                /mo{annual ? ", billed annually" : ""}
              </span>
            </div>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {p.facts.map((f) => (
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
              className={`mt-7 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
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
}) {
  return (
    <div>
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
}: {
  planId: PlanId;
  setPlanId: (id: PlanId) => void;
  annual: boolean;
}) {
  const [filings, setFilings] = useState(12);
  const [hoursPerFiling, setHoursPerFiling] = useState(2.5);
  const [rate, setRate] = useState(180);
  // Honesty knob: how much of that manual checking time CitationGuard truly removes.
  const [automation, setAutomation] = useState(65);

  const plan = PLANS.find((p) => p.id === planId)!;
  const cost = annual ? plan.annual : plan.monthly;

  const compute = (autoPct: number) => {
    const hoursSaved = filings * hoursPerFiling * (autoPct / 100);
    const value = hoursSaved * rate;
    const net = value - cost;
    const roi = cost > 0 ? net / cost : 0;
    // Break-even: filings needed for saved time to cover the monthly cost.
    const valuePerFiling = hoursPerFiling * (autoPct / 100) * rate;
    const breakevenFilings = valuePerFiling > 0 ? cost / valuePerFiling : Infinity;
    return { hoursSaved, value, net, roi, breakevenFilings };
  };

  const base = useMemo(
    () => compute(automation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filings, hoursPerFiling, rate, automation, cost],
  );
  const conservative = compute(Math.max(20, automation - 25));
  const optimistic = compute(Math.min(100, automation + 20));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="rounded-2xl border border-n300 bg-surface p-7">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-action">
          <Calculator className="h-4 w-4" /> Your numbers
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLANS.map((p) => (
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
              {p.name} · {GBP(annual ? p.annual : p.monthly)}/mo
            </button>
          ))}
        </div>
        <div className="mt-7 space-y-7">
          <Field
            label="Filings per month"
            hint="Skeleton arguments / pleadings you run through review."
            value={filings}
            onChange={setFilings}
            min={1}
            max={120}
            step={1}
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
          />
          <Field
            label="Honesty knob — time CitationGuard actually removes"
            hint="Be conservative. It assists review; it doesn't replace your sign-off."
            value={automation}
            onChange={setAutomation}
            min={20}
            max={100}
            step={5}
            suffix="%"
          />
        </div>
      </div>

      {/* Live result */}
      <div className="flex flex-col rounded-2xl border-2 border-ink bg-ink p-7 text-paper">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent-lime">
          <TrendingUp className="h-4 w-4" /> Your return — live
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Metric label="Hours saved / mo" value={`${base.hoursSaved.toFixed(1)} h`} />
          <Metric label="Time value / mo" value={GBP(base.value)} />
          <Metric label="Plan cost / mo" value={GBP(cost)} />
          <Metric
            label="Net benefit / mo"
            value={GBP(base.net)}
            highlight={base.net >= 0}
          />
        </div>
        <div className="mt-5 rounded-xl bg-ink-700 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-paper/70">Return on the plan</span>
            <span className="font-display text-3xl font-semibold text-accent-lime">
              {base.roi >= 0 ? `${Math.round(base.roi * 100)}%` : "—"}
            </span>
          </div>
          <p className="mt-2 text-sm text-paper/70">
            Break-even at{" "}
            <span className="font-mono text-paper">
              {Number.isFinite(base.breakevenFilings)
                ? base.breakevenFilings.toFixed(1)
                : "—"}
            </span>{" "}
            filings/month. You scan {filings}.
          </p>
        </div>

        {/* Sensitivity */}
        <div className="mt-5">
          <p className="font-mono text-[11px] uppercase tracking-widest text-paper/40">
            Sensitivity — net benefit / mo
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Scenario name="Conservative" value={GBP(conservative.net)} />
            <Scenario name="Base" value={GBP(base.net)} featured />
            <Scenario name="Optimistic" value={GBP(optimistic.net)} />
          </div>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-lime px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Start my first scan <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="/#faq"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-5 py-3 text-sm font-semibold text-paper transition-colors hover:border-paper"
          >
            Talk to the team
          </a>
        </div>
      </div>
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
            You don&rsquo;t pay CitationGuard against zero — you pay it against the cost of one bad
            authority reaching the court. That is what makes a few hundred pounds a month an easy
            call.
          </p>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">~1 in 6</p>
            <p className="mt-3 text-sm text-paper/80">
              rate at which leading LLMs hallucinate legal citations.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              Verified · Stanford HAI
            </p>
          </div>
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">CPR r.44.11</p>
            <p className="mt-3 text-sm text-paper/80">
              wasted-costs exposure for putting bad authority before the court.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              Verified · Civil Procedure Rules
            </p>
          </div>
          <div className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
            <p className="font-display text-4xl font-semibold text-accent-lime">0</p>
            <p className="mt-3 text-sm text-paper/80">
              hallucinated existence verdicts — deterministic lookup returns only what the corpus
              holds.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
              By construction
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-sm text-paper/60">
          One wasted-costs order, or one filing discredited in front of a judge, dwarfs a year of
          subscription. The calculator above only counts review hours — the risk avoided is on top.
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
      label: "Hallucination rate (~1 in 6) & CPR r.44.11",
      status: "Verified",
      note: "Cited to Stanford HAI and the Civil Procedure Rules respectively.",
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
        This page is illustrative, not a cotización. CitationGuard is decision support, not legal
        advice — the signing advocate remains responsible for every authority.
      </p>
    </section>
  );
}

function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [planId, setPlanId] = useState<PlanId>("chambers");

  return (
    <main className="min-h-screen bg-paper">
      <Nav current="pricing" />

      {/* 1. Value frame header */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-action">
            Investment &amp; return
          </p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            Recover the month&rsquo;s cost on the{" "}
            <span className="bg-accent-lime px-1 text-ink">first filing you check.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-n500">
            Below is the honest version: real plan prices, the infra cost behind each, and a
            calculator that uses your numbers — not ours — to show your break-even, payback and
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
            matters is the one you generate — including a conservative scenario, because we&rsquo;d
            rather under-promise.
          </p>
        </div>
        <div className="mt-10">
          <ReturnCalculator planId={planId} setPlanId={setPlanId} annual={annual} />
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