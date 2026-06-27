import { ShieldAlert } from "lucide-react";

// R10 — professional-responsibility scope statement.
export function ScopeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-n300 bg-surface px-4 py-3 text-sm text-n500">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" aria-hidden="true" />
      <p>
        TraceIt is decision support for citation integrity,{" "}
        <span className="font-semibold text-ink">not legal advice</span>. Coverage gaps are
        disclosed per finding. The signing advocate remains responsible for every authority in the
        filing.
      </p>
    </div>
  );
}