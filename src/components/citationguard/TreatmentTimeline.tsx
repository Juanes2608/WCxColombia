import type { Layer2 } from "@/lib/types";

interface Entry {
  tone: "bad" | "warn";
  kind: string;
  citing_case: string;
  year: number;
  court: string;
  context: string;
}

export function TreatmentTimeline({ layer2 }: { layer2: Layer2 }) {
  const entries: Entry[] = [
    ...layer2.overruled_by.map((r) => ({ ...r, tone: "bad" as const, kind: "Overruled by" })),
    ...layer2.distinguished_by.map((r) => ({
      ...r,
      tone: "warn" as const,
      kind: "Distinguished by",
    })),
  ];

  if (entries.length === 0) {
    return (
      <p className="text-sm text-n500">
        No adverse treatment found in the corpus for this authority.
      </p>
    );
  }

  return (
    <ol className="relative space-y-5 border-l border-n300 pl-5">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-surface ${
              e.tone === "bad" ? "bg-bad" : "bg-warn"
            }`}
            aria-hidden="true"
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-n500">
            {e.kind}
          </p>
          <p className="mt-0.5 font-medium text-ink">
            {e.citing_case}{" "}
            <span className="font-mono text-sm text-ink-300">({e.year})</span>
          </p>
          <p className="text-xs text-n500">{e.court}</p>
          <p className="mt-1 text-sm italic text-n700">{e.context}</p>
        </li>
      ))}
    </ol>
  );
}