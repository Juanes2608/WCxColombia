import { AlertTriangle } from "lucide-react";

// R1 — persistent banner when the good-law layer is degraded.
export function DegradedNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-unk-bd bg-unk-bg px-4 py-3 text-sm text-unk"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Good-law layer degraded.</span> &ldquo;Still good
        law?&rdquo; was not checked for some authorities. Those rows read{" "}
        <span className="font-mono uppercase">Not checked</span>, not passed.
      </p>
    </div>
  );
}