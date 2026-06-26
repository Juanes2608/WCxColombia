import { Link } from "@tanstack/react-router";
import { ArrowRight, ScanSearch } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import { ThemeToggle } from "@/components/citationguard/ThemeToggle";

// Shared brand chrome so the landing and pricing pages feel like one experience.
// The nav links jump back to landing sections from anywhere (cross-page hrefs),
// and "Precios" routes to /pricing — landing ⇄ pricing in a single click.

const NAV_LINKS = [
  { href: "/#demo", label: "Product" },
  { href: "/#engines", label: "How it works" },
  { href: "/#thesis", label: "About" },
];

export function Nav({ current }: { current?: "landing" | "pricing" }) {
  return (
    <header className="sticky top-0 z-50 border-b border-n300/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link to="/" aria-label="CitationGuard home">
          <Logo variant="wordmark" />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-n500 transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/pricing"
            className={`text-sm font-medium transition-colors hover:text-ink ${
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
            className="hidden text-sm font-medium text-n500 transition-colors hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <Link
            to="/scan"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-700"
          >
            Try demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Closing() {
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
            href="/#faq"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-6 py-3 text-sm font-semibold text-paper transition-colors hover:border-paper"
          >
            Talk to the team <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-n300/70 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" aria-label="CitationGuard home">
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
          © {new Date().getFullYear()} CitationGuard. Decision support for citation integrity — not
          legal advice.
        </p>
      </div>
    </footer>
  );
}