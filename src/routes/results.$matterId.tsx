import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/results/$matterId")({
  component: ResultsPage,
});

// Phase 1 placeholder — full forensic dashboard lands in Phase 2.
function ResultsPage() {
  const { matterId } = Route.useParams();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
      <p className="font-mono text-sm text-n500">matter {matterId}</p>
      <p className="text-ink">Results dashboard arrives in Phase 2.</p>
      <Link to="/" className="font-semibold text-ink underline">
        New document
      </Link>
    </main>
  );
}