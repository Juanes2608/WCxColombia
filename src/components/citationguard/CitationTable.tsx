import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { CitationResult } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VerdictBadge } from "./VerdictBadge";

type Filter = "all" | "flagged" | "verified";

const ORDER: Record<string, number> = { FABRICATED: 0, MISAPPLIED: 1, VERIFIED: 2 };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "verified", label: "Verified" },
];

export function CitationTable({
  results,
  onSelect,
}: {
  results: CitationResult[];
  onSelect: (c: CitationResult) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const sorted = [...results].sort(
      (a, b) => ORDER[a.layer1.verdict] - ORDER[b.layer1.verdict],
    );
    return sorted.filter((r) => {
      if (filter === "flagged") return r.layer1.verdict !== "VERIFIED";
      if (filter === "verified") return r.layer1.verdict === "VERIFIED";
      return true;
    });
  }, [results, filter]);

  return (
    <div className="rounded-xl border border-n300 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n100 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-n700">
          Citations
        </h2>
        <div className="inline-flex rounded-lg border border-n300 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`relative rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f.id ? "text-paper" : "text-n500 hover:text-ink"
              }`}
            >
              {filter === f.id && (
                <motion.span
                  layoutId="citation-filter-pill"
                  className="absolute inset-0 rounded-md bg-ink"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Citation</TableHead>
            <TableHead className="w-36">Layer 1</TableHead>
            <TableHead className="w-40">Layer 2 (Clio)</TableHead>
            <TableHead className="w-28">Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <Tooltip key={`${r.raw_text}-${i}`}>
              <TooltipTrigger asChild>
                <TableRow
                  tabIndex={0}
                  onClick={() => onSelect(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(r);
                    }
                  }}
                  className="cursor-pointer focus:outline-none focus-visible:bg-n100"
                >
                  <TableCell className="font-mono text-xs text-n500">{i + 1}</TableCell>
                  <TableCell className="max-w-[18rem] truncate font-medium text-ink">
                    {r.raw_text}
                  </TableCell>
                  <TableCell>
                    <VerdictBadge layer="authenticity" verdict={r.layer1.verdict} />
                  </TableCell>
                  <TableCell>
                    {r.layer2.verdict === "NOT_CHECKED" ? (
                      <span className="text-n500">—</span>
                    ) : (
                      <VerdictBadge
                        layer="goodlaw"
                        verdict={r.layer2.verdict}
                        source={r.layer2.source}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-n500">
                    {r.statutory ? "statute" : "case law"}
                  </TableCell>
                </TableRow>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-xs">
                {r.layer1.explanation}
              </TooltipContent>
            </Tooltip>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-n500">
                No citations match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}