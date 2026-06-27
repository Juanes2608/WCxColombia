import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy } from "lucide-react";
import type { CitationResult, VerifyResult } from "@/lib/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScopeBanner } from "@/components/citationguard/ScopeBanner";
import { DegradedNotice } from "@/components/citationguard/DegradedNotice";
import { SummaryCards } from "@/components/citationguard/SummaryCards";
import { CitationTable } from "@/components/citationguard/CitationTable";
import { CitationDetail } from "@/components/citationguard/CitationDetail";
import { FinancialPanel } from "@/components/citationguard/FinancialPanel";

export const Route = createFileRoute("/results/$matterId")({
  head: () => ({
    meta: [
      { title: "Report — TraceIt" },
      {
        name: "description",
        content:
          "Citation-integrity report: every authority checked for existence, application and good-law status.",
      },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { matterId } = Route.useParams();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<CitationResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(`result-${matterId}`);
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setResult(JSON.parse(raw) as VerifyResult);
    } catch {
      setMissing(true);
    }
  }, [matterId]);

  if (missing) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-sm text-n500">matter {matterId}</p>
        <p className="text-ink">
          This report is no longer in memory. Reports live only in this browser session.
        </p>
        <Link to="/" className="font-semibold text-ink underline">
          Scan a new document
        </Link>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center">
        <p className="font-mono text-sm text-n500">Loading report…</p>
      </main>
    );
  }

  const degraded = result.results.some(
    (r) => r.layer2.source === "csv" || r.layer2.verdict === "UNAVAILABLE",
  );

  function copyHash() {
    navigator.clipboard?.writeText(result!.audit_trail_hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <main className="relative min-h-dvh px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              New document
            </Link>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-n500">
              <span title={result.matter_id}>
                matter {result.matter_id.slice(0, 8)}…
              </span>
              <span>{result.processing_ms} ms</span>
              <button
                type="button"
                onClick={copyHash}
                className="inline-flex items-center gap-1.5 hover:text-ink"
                title={result.audit_trail_hash}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                sha256 {result.audit_trail_hash.slice(0, 12)}…
              </button>
            </div>
          </header>

          <SummaryCards total={result.total_citations} financial={result.financial} />
          <ScopeBanner />
          {degraded && <DegradedNotice />}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CitationTable results={result.results} onSelect={setSelected} />
            </div>
            <div className="lg:col-span-1">
              <FinancialPanel financial={result.financial} />
            </div>
          </div>
        </div>

        <CitationDetail citation={selected} onClose={() => setSelected(null)} />
      </main>
    </TooltipProvider>
  );
}