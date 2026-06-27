import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";

// Strong ease-out curve (Emil): built-in easings are too weak for entrances.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
import {
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Gem,
  FileSearch,
  History,
  Quote,
} from "lucide-react";
import { Nav, Closing, Footer } from "@/components/citationguard/SiteChrome";
import { DecryptedText } from "@/components/motion/DecryptedText";
import { CountUp } from "@/components/motion/CountUp";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Atmosphere } from "@/components/motion/Atmosphere";
import { AppMock } from "@/components/citationguard/AppMock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TraceIt: Because the AI invents. The corpus doesn't." },
      {
        name: "description",
        content:
          "Verify every authority in a High Court skeleton argument before you file: does it exist, is it applied correctly, is it still good law? The fabrication verdict comes from deterministic corpus lookup, never an LLM.",
      },
      { property: "og:title", content: "TraceIt: Citation integrity for the Bar" },
      {
        property: "og:description",
        content: "Because the AI invents. The corpus doesn't.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden">
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <motion.div
          initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
        <p className="font-mono text-xs uppercase tracking-widest text-action">
          Citation integrity for the Bar
        </p>
        <h1 className="mt-6 font-editorial text-4xl font-medium leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
          Because the AI invents.
          <br />
          <span className="mark-lime">
            <DecryptedText text={"The corpus doesn’t."} />
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-n500">
          Upload a skeleton argument and TraceIt checks every authority against the real
          corpus before it reaches the court: does it exist, is it applied correctly, is it still
          good law? The fabrication verdict comes from deterministic lookup, never a language model.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:bg-ink-700 active:scale-[0.97]"
          >
            <ScanSearch className="h-4 w-4" /> Scan a skeleton argument
          </Link>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-lg border border-n300 px-6 py-3 text-sm font-semibold text-ink transition hover:border-ink active:scale-[0.97]"
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
        initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(24px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration: 0.7, delay: reduce ? 0 : 0.15, ease: EASE_OUT }}
      >
        <AppMock />
        </motion.div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section
      id="demo"
      className="border-y border-ink/10 bg-surface/80 backdrop-blur-2xl dark:bg-surface/50"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-editorial text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From upload to verdict in under two minutes.
          </h2>
          <p className="mt-4 text-lg text-n500">
            Watch a real skeleton go in and come out with every citation marked as fabricated,
            misapplied, or verified, each with its source.
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
        <h2 className="font-editorial text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Where a citation costs you the case.
        </h2>
        <p className="mt-4 text-lg text-n500">
          Three checks run on every authority. The first one is deterministic, and it&rsquo;s the
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
              Deterministic lookup against the corpus, with no model in the loop.
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
        Anything advisory or model-generated is labelled as such, so you always know what&rsquo;s a
        fact and what&rsquo;s a judgement.
      </p>
    </section>
  );
}

function Proof() {
  const stats: {
    label: string;
    src: string;
    value?: string;
    count?: { prefix?: string; to: number; suffix?: string };
  }[] = [
    {
      count: { prefix: "~1 in ", to: 6 },
      label: "rate at which leading LLMs hallucinate legal citations",
      src: "Stanford HAI",
    },
    { value: "CPR r.44.11", label: "wasted-costs exposure for citing bad authority", src: "Civil Procedure Rules" },
    { value: "0", label: "hallucinated verdicts in deterministic corpus lookup", src: "By construction" },
  ];
  return (
    <section
      id="proof"
      className="relative overflow-hidden border-y border-white/10 bg-ink-fixed"
    >
      <Atmosphere />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 text-paper-fixed">
        <div className="max-w-2xl">
          <h2 className="font-editorial text-3xl font-semibold tracking-tight sm:text-4xl">
            One fabricated citation is enough to discredit the filing.
          </h2>
          <p className="mt-4 text-lg text-paper-fixed/70">
            Generative AI fabricates legal citations at a measurable rate. Deterministic lookup
            fabricates none, because it can only return what the corpus contains.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-surface-fixed/80 p-7 backdrop-blur-sm"
            >
              <p className="font-display text-4xl font-semibold text-accent-lime">
                {s.count ? (
                  <CountUp prefix={s.count.prefix} to={s.count.to} suffix={s.count.suffix} />
                ) : (
                  s.value
                )}
              </p>
              <p className="mt-3 text-sm text-paper-fixed/80">{s.label}</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-paper-fixed/40">
                {s.src}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 font-mono text-xs text-paper-fixed/50">
          Computed deterministically, not LLM-generated.
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
      body: "TraceIt is decision support, not legal advice, and we label every advisory note as advisory.",
    },
  ];
  return (
    <section id="thesis" className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="font-editorial text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          We sell certainty, not another AI that guesses.
        </h2>
        <p className="mt-4 text-lg text-n500">
          Every other tool adds a model to your workflow. We add a corpus, and we tell you exactly
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
            The verdict that can sink you, whether this authority exists, never comes from a
            language model.
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
      a: "Every verdict shows its source and a confidence signal, and coverage gaps are flagged per finding, so a wrong call is visible and auditable, not silent. You review the flags; you don\u2019t outsource the judgement.",
    },
    {
      q: "Could TraceIt hallucinate, like the AI it\u2019s checking?",
      a: "The existence verdict can\u2019t. It\u2019s deterministic lookup: it returns what\u2019s in the corpus or nothing. Only clearly labelled advisory notes involve a model.",
    },
    {
      q: "Why deterministic instead of a smarter AI?",
      a: "Because \u201Csmarter\u201D still guesses, and one guessed citation in front of a judge is one too many. Facts that can be looked up should be looked up.",
    },
    {
      q: "Who\u2019s responsible if a bad citation gets through?",
      a: "The signing advocate remains responsible for every authority. TraceIt is decision support, not legal advice. We make the risk visible; we don\u2019t assume it.",
    },
  ];
  return (
    <section
      id="faq"
      className="border-t border-ink/10 bg-surface/80 backdrop-blur-2xl dark:bg-surface/50"
    >
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="font-editorial text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
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

function Landing() {
  return (
    <main className="relative min-h-dvh">
      <Nav />
      <Hero />
      <AnimatedContent>
        <Demo />
      </AnimatedContent>
      <AnimatedContent>
        <Engines />
      </AnimatedContent>
      <AnimatedContent>
        <Proof />
      </AnimatedContent>
      <AnimatedContent>
        <Thesis />
      </AnimatedContent>
      <AnimatedContent>
        <Faq />
      </AnimatedContent>
      <AnimatedContent>
        <Closing />
      </AnimatedContent>
      <Footer />
    </main>
  );
}
