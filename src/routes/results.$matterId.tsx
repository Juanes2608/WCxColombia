import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { VerifyResult } from "@/lib/types";
import { getReport } from "@/lib/api-client";
import { VerificationSplitView } from "@/components/citationguard/VerificationSplitView";

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

  useEffect(() => {
    const raw = sessionStorage.getItem(`result-${matterId}`);
    if (raw) {
      try {
        setResult(JSON.parse(raw) as VerifyResult);
        return;
      } catch {
        // corrupt cache — fall through
      }
    }

    let cancelled = false;
    getReport(matterId)
      .then((report) => {
        if (cancelled) return;
        setResult(report);
        sessionStorage.setItem(`result-${matterId}`, JSON.stringify(report));
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });

    return () => { cancelled = true; };
  }, [matterId]);

  if (missing) {
    return (
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-sm text-n500">matter {matterId}</p>
        <p className="text-ink">
          This report is no longer in memory. Reports persist only within the current browser session.
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

  return <VerificationSplitView result={result} matterId={matterId} />;
}
