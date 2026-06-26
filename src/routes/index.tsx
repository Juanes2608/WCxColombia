import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Scale,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Gem,
  FileSearch,
  History,
  Quote,
} from "lucide-react";
import { Nav, Closing, Footer } from "@/components/citationguard/SiteChrome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CitationGuard — Because the AI invents. The corpus doesn't." },
      {
        name: "description",
        content:
          "Verify every authority in a High Court skeleton argument — does it exist, is it applied correctly, is it still good law — before you file. Fabricated verdicts from deterministic corpus lookup, never an LLM.",
      },
      { property: "og:title", content: "CitationGuard — Citation integrity for the Bar" },
      {
        property: "og:description",
        content: "Because the AI invents. The corpus doesn't.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function VerdictRow({
  tone,
  icon: Icon,
  cite,
  verdict,
  note,
}: {
  tone: "bad" | "warn" | "good";
  icon: typeof XCircle;
  cite: string;
  verdict: string;
  note: string;
}) {
  const pill = {
    bad: "bg-bad-bg text-bad border-bad-bd",
    warn: "bg-warn-bg text-warn border-warn-bd",
    good: "bg-good-bg text-good border-good-bd",
  }[tone];
  const iconColor = { bad: "text-bad", warn: "text-warn", good: "text-good" }[tone];
  return (
    <div className="flex items-start gap-3 border-b border-n100 px-4 py-3 last:border-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-ink">{cite}</p>
        <p className="mt-0.5 text-xs text-n500">{note}</p>
      </div>
      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${pill}`}
      >
        {verdict}
      </span>
    </div>
  );
}

function ProductMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-n300 bg-surface shadow-2xl shadow-ink/10">
      <div className="flex items-center justify-between border-b border-n100 bg-paper px-4 py-2.5">
        <span className="font-mono text-[11px] text-n500">matter · a4f9…c21</span>
        <span className="rounded-md bg-bad-bg px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-bad">
          1 fabricated
        </span>
      </div>
      <VerdictRow
        tone="bad"
        icon={XCircle}
        cite="Carlisle v Rookwood Holdings Ltd [2021] EWHC 4412 (Comm)"
        verdict="Fabricated"
        note="No such neutral citation exists in the corpus."
      />
      <VerdictRow
        tone="warn"
        icon={AlertTriangle}
        cite="Pepper v Hart [1992] UKHL 3"
        verdict="Misapplied"
        note="Cited broader than its ratio — conditions omitted."
      />
      <VerdictRow
        tone="good"
        icon={CheckCircle2}
        cite="Donoghue v Stevenson [1932] UKHL 100"
        verdict="Verified"
        note="Exists, faithfully stated, still good law."
      />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <p className="font-mono text-xs uppercase tracking-widest text-action">
          Citation integrity for the Bar
        </p>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
          Because the AI invents.
          <br />
          <span className="bg-accent-lime px-1 text-ink">The corpus doesn&rsquo;t.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-n500">
          Upload a skeleton argument and CitationGuard checks every authority against the real
          corpus — does it exist, is it applied correctly, is it still good law — before it reaches
          the court. Fabricated verdicts come from deterministic lookup, never a language model.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-700"
          >
            <ScanSearch className="h-4 w-4" /> Scan a skeleton argument
          </Link>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-lg border border-n300 px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            <PlayCircle className="h-4 w-4" /> See how it works
          </a>
        </div>
        <ul className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-n500">
          <li>legislation.gov.uk</li>
          <li aria-hidden="true">·</li>
          <li>Clio case treatment</li>
          <li aria-hidden="true">·</li>
          <li>CPR r.44.11</li>
          <li aria-hidden="true">·</li>
          <li className="text-action">0 hallucinated verdicts</li>
        </ul>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
      >
        <ProductMock />
      </motion.div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="border-y border-n300/70 bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From upload to verdict in under two minutes.
          </h2>
          <p className="mt-4 text-lg text-n500">
            Watch a real skeleton go in and come out with every citation marked — fabricated,
            misapplied, or verified — each with its source.
          </p>
        </div>
        <div className="mt-10 flex aspect-video w-full items-center justify-center rounded-2xl border border-n300 bg-paper">
          <div className="text-center">
            <PlayCircle className="mx-auto h-14 w-14 text-ink-300" aria-hidden="true" />
            <p className="mt-3 font-mono text-xs uppercase tracking-widest text-n500">
              Walkthrough · 90s
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-n500">
          Prefer to touch it?{" "}
          <Link to="/scan" className="font-semibold text-ink underline underline-offset-4">
            Open the live demo →
          </Link>
        </p>
      </div>
    </section>
  );
}

function Engines() {
  const supporting = [
    {
      icon: FileSearch,
      name: "Application check",
      lede: "Is the case cited for what it actually held?",
      bullets: [
        "Compares proposition cited vs proposition actual",
        "Surfaces misapplied authorities side-by-side",
        "Confidence meter on every comparison",
      ],
    },
    {
      icon: History,
      name: "Good-law check",
      lede: "Is it still good law today?",
      bullets: [
        "Adverse-treatment timeline from Clio",
        "Overruled / distinguished, with citing case",
        "Coverage gaps disclosed per finding",
      ],
    },
  ];
  return (
    <section id="engines" className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Where a citation costs you the case.
        </h2>
        <p className="mt-4 text-lg text-n500">
          Three checks run on every authority. The first one is deterministic — and it&rsquo;s the
          one that ends careers if it&rsquo;s wrong.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* The jewel */}
        <div className="rounded-2xl border-2 border-ink bg-ink p-7 text-paper lg:row-span-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent-lime">
            <Gem className="h-4 w-4" /> The deterministic core
          </div>
          <h3 className="mt-4 font-display text-2xl font-semibold">Existence check</h3>
          <p className="mt-2 text-sm text-paper/70">
            Does this authority actually exist, exactly as cited?
          </p>
          <ul className="mt-5 space-y-2 text-sm text-paper/90">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" />
              Deterministic lookup against the corpus — no model in the loop.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" />
              Flags fabricated citations and altered neutral citations.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-lime" />
              Every verdict traces to a corpus miss, not an opinion.
            </li>
          </ul>
        </div>

        {supporting.map((c) => (
          <div key={c.name} className="rounded-2xl border border-n300 bg-surface p-7">
            <c.icon className="h-6 w-6 text-action" aria-hidden="true" />
            <h3 className="mt-4 font-display text-xl font-semibold text-ink">{c.name}</h3>
            <p className="mt-2 text-sm text-n500">{c.lede}</p>
            <ul className="mt-5 space-y-2 text-sm text-ink">
              {c.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-n500">
        Existence is deterministic corpus lookup. Application and treatment draw on cited sources.
        Anything advisory or model-generated is labelled as such — so you always know what&rsquo;s a
        fact and what&rsquo;s a judgement.
      </p>
    </section>
  );
}

function Proof() {
  const stats = [
    { value: "~1 in 6", label: "rate at which leading LLMs hallucinate legal citations", src: "Stanford HAI" },
    { value: "CPR r.44.11", label: "wasted-costs exposure for citing bad authority", src: "Civil Procedure Rules" },
    { value: "0", label: "hallucinated verdicts in deterministic corpus lookup", src: "By construction" },
  ];
  return (
    <section id="proof" className="border-y border-n300/70 bg-ink">
      <div className="mx-auto max-w-6xl px-6 py-20 text-paper">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One fabricated citation is enough to discredit the filing.
          </h2>
          <p className="mt-4 text-lg text-paper/70">
            Generative AI fabricates legal citations at a measurable rate. Deterministic lookup
            fabricates none — because it can only return what the corpus contains.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-paper/15 bg-ink-700 p-7">
              <p className="font-display text-4xl font-semibold text-accent-lime">{s.value}</p>
              <p className="mt-3 text-sm text-paper/80">{s.label}</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper/40">
                {s.src}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 font-mono text-xs text-paper/50">
          Computed deterministically — not LLM-generated.
        </p>
      </div>
    </section>
  );
}

function Thesis() {
  const principles = [
    {
      icon: AlertTriangle,
      title: "Gaps are disclosed, not hidden.",
      body: "When coverage is incomplete, we say so on the finding. Silence is never \u201Cverified\u201D.",
    },
    {
      icon: Scale,
      title: "The advocate signs, not the software.",
      body: "CitationGuard is decision support, not legal advice — and we label every advisory note as advisory.",
    },
  ];
  return (
    <section id="thesis" className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          We sell certainty, not another AI that guesses.
        </h2>
        <p className="mt-4 text-lg text-n500">
          Every other tool adds a model to your workflow. We add a corpus — and we tell you exactly
          where the model stops and the facts begin.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border-2 border-action bg-surface p-7 lg:col-span-1">
          <ShieldCheck className="h-7 w-7 text-action" aria-hidden="true" />
          <h3 className="mt-4 font-display text-2xl font-semibold text-ink">
            Deterministic where it counts.
          </h3>
          <p className="mt-3 text-sm text-n500">
            The verdict that can sink you — does this authority exist — never comes from a language
            model.
          </p>
        </div>
        {principles.map((p) => (
          <div key={p.title} className="rounded-2xl border border-n300 bg-surface p-7">
            <p.icon className="h-6 w-6 text-ink-300" aria-hidden="true" />
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">{p.title}</h3>
            <p className="mt-3 text-sm text-n500">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const qa = [
    {
      q: "What happens when it gets a citation wrong?",
      a: "Every verdict shows its source and a confidence signal, and coverage gaps are flagged per finding — so a wrong call is visible and auditable, not silent. You review the flags; you don\u2019t outsource the judgement.",
    },
    {
      q: "Could CitationGuard hallucinate, like the AI it\u2019s checking?",
      a: "The existence verdict can\u2019t. It\u2019s deterministic lookup — it returns what\u2019s in the corpus or nothing. Only clearly-labelled advisory notes involve a model.",
    },
    {
      q: "Why deterministic instead of a smarter AI?",
      a: "Because \u201Csmarter\u201D still guesses, and one guessed citation in front of a judge is one too many. Facts that can be looked up should be looked up.",
    },
    {
      q: "Who\u2019s responsible if a bad citation gets through?",
      a: "The signing advocate remains responsible for every authority — CitationGuard is decision support, not legal advice. We make the risk visible; we don\u2019t assume it.",
    },
  ];
  return (
    <section id="faq" className="border-t border-n300/70 bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          What the person who signs wants to know.
        </h2>
        <dl className="mt-10 divide-y divide-n100">
          {qa.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="flex items-start gap-2 font-display text-lg font-semibold text-ink">
                <Quote className="mt-1 h-4 w-4 shrink-0 text-action" aria-hidden="true" />
                {item.q}
              </dt>
              <dd className="mt-2 pl-6 text-sm text-n500">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section id="audience" className="bg-ink">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center text-paper">
        <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Because the AI invents.
          <br />
          <span className="bg-accent-lime px-1 text-ink">The corpus doesn&rsquo;t.</span>
        </h2>
        <p className="mt-5 text-lg text-paper/70">
          Deterministic citation integrity, with every gap disclosed. The corpus is the witness.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-lime px-6 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <ScanSearch className="h-4 w-4" /> Scan a skeleton argument
          </Link>
          <a
            href="#faq"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-6 py-3 text-sm font-semibold text-paper transition-colors hover:border-paper"
          >
            Talk to the team <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-n300/70 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Logo variant="wordmark" />
        <p className="max-w-md text-xs text-n500">
          © {new Date().getFullYear()} CitationGuard. Decision support for citation integrity — not
          legal advice.
        </p>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <main className="min-h-screen bg-paper">
      <Nav />
      <Hero />
      <Demo />
      <Engines />
      <Proof />
      <Thesis />
      <Faq />
      <Closing />
      <Footer />
    </main>
  );
}
