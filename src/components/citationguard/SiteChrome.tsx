import { Link } from "@tanstack/react-router";
import { ArrowRight, ScanSearch } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import { ThemeToggle } from "@/components/citationguard/ThemeToggle";
import { Atmosphere } from "@/components/motion/Atmosphere";

// Shared brand chrome so the landing and pricing pages feel like one experience.
// The nav links jump back to landing sections from anywhere (cross-page hrefs),
// and "Precios" routes to /pricing — landing ⇄ pricing in a single click.

const NAV_LINKS = [
  { href: "/#demo", label: "Product" },
  { href: "/#engines", label: "How it works" },
];

export function Nav({ current }: { current?: "landing" | "pricing" | "about" }) {
  return (
    <header className="sticky top-0 z-50 border-b border-n300/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <Link to="/" aria-label="TraceIt home" className="origin-left scale-[1.22]">
          <Logo variant="wordmark" />
        </Link>
        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[15px] font-medium text-n500 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/about"
            className={`text-[15px] font-medium transition-colors hover:text-ink ${
              current === "about" ? "text-ink" : "text-n500"
            }`}
          >
            About
          </Link>
          <Link
            to="/pricing"
            className={`text-[15px] font-medium transition-colors hover:text-ink ${
              current === "pricing" ? "text-ink" : "text-n500"
            }`}
          >
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/signin"
            className="hidden text-[15px] font-medium text-n500 transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper transition hover:bg-ink-700 active:scale-[0.97]"
          >
            Try demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Closing({
  secondaryLabel = "Talk to the team",
  secondaryHref = "/about",
}: {
  secondaryLabel?: string;
  secondaryHref?: "/about" | "/pricing" | "/scan";
} = {}) {
  return (
    <section id="audience" className="relative overflow-hidden bg-ink-fixed">
      <Atmosphere intensity="bold" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-28 text-center text-paper-fixed">
        <h2 className="font-editorial text-3xl font-medium tracking-tight sm:text-4xl">
          Because the AI invents.
          <br />
          <span className="mark-lime">The corpus doesn&rsquo;t.</span>
        </h2>
        <p className="mt-5 text-lg text-paper-fixed/70">
          Deterministic citation integrity, with every gap disclosed. The corpus is the witness.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-lime px-6 py-3 text-sm font-semibold text-ink-fixed transition hover:opacity-90 active:scale-[0.97]"
          >
            <ScanSearch className="h-4 w-4" /> Scan a skeleton argument
          </Link>
          <Link
            to={secondaryHref}
            className="inline-flex items-center gap-2 rounded-lg border border-paper-fixed/25 px-6 py-3 text-sm font-semibold text-paper-fixed transition hover:border-paper-fixed active:scale-[0.97]"
          >
            {secondaryLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-n300/70 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" aria-label="TraceIt home">
          <Logo variant="wordmark" />
        </Link>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-n500">
          <Link to="/pricing" className="font-medium transition-colors hover:text-ink">
            Pricing
          </Link>
          <a href="/#faq" className="font-medium transition-colors hover:text-ink">
            FAQ
          </a>
          <Link to="/scan" className="font-medium transition-colors hover:text-ink">
            Scan a document
          </Link>
        </div>
        <p className="max-w-md text-xs text-n500">
          © {new Date().getFullYear()} TraceIt. Decision support for citation integrity, not
          legal advice.
        </p>
      </div>
    </footer>
  );
}