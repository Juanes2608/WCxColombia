import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Lock, Mail, ScanSearch } from "lucide-react";
import { Logo } from "@/components/citationguard/Logo";
import { ThemeToggle } from "@/components/citationguard/ThemeToggle";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in — CitationGuard" },
      {
        name: "description",
        content:
          "Sign in to CitationGuard to scan skeleton arguments and verify citation integrity against the corpus.",
      },
      { property: "og:title", content: "Sign in — CitationGuard" },
      {
        property: "og:description",
        content: "Access the deterministic citation-integrity workspace.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    // Mock auth bridge: hand the user straight into the tool.
    setTimeout(() => navigate({ to: "/scan" }), 500);
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="CitationGuard home">
          <Logo variant="wordmark" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-2 lg:items-center">
        <div className="hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-widest text-action">
            The bridge to the tool
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">
            Sign in and start
            <br />
            <span className="bg-accent-lime px-1 text-ink">checking citations.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-n500">
            Your workspace keeps every scan, verdict and audit trail in one place.
            Deterministic integrity, every gap disclosed.
          </p>
          <div className="mt-8 rounded-xl border border-n300/70 bg-surface p-5">
            <p className="text-sm text-n500">
              No account yet? You can try a live demo without signing in.
            </p>
            <Link
              to="/scan"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-action transition-opacity hover:opacity-80"
            >
              <ScanSearch className="h-4 w-4" /> Try the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-2xl border border-n300/70 bg-surface p-8 shadow-sm">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-n500">Welcome back. Enter your details to continue.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-n700">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-n500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@chambers.law"
                  className="w-full rounded-lg border border-n300 bg-paper py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors focus:border-ink"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-n700">
                Password
                <a href="#" className="text-xs font-medium text-action hover:opacity-80">
                  Forgot?
                </a>
              </span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-n500" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-n300 bg-paper py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors focus:border-ink"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-700 disabled:opacity-60"
            >
              {submitting ? "Opening workspace…" : "Sign in"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-6 border-t border-n300/70 pt-4 text-center text-sm text-n500">
            New to CitationGuard?{" "}
            <Link to="/scan" className="font-semibold text-action hover:opacity-80">
              Try the demo
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
