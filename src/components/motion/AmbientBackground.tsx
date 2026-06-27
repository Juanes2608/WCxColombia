// Global animated backdrop for the whole landing — keeps the page from ever
// feeling flat. Fixed behind all content (so it stays alive while you scroll).
//
// Built around the Citation Network: drifting nodes joined by proximity edges,
// the corpus as a living citation graph. Layered over a faint forensic grid (the
// substrate the citations are plotted on) and slow drifting glow orbs for colour
// and depth, finished with a grain layer. Brand colours only; the network and
// orbs disable their motion under prefers-reduced-motion.

import { CitationNetworkCanvas } from "./CitationNetworkCanvas";

const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

const EDGE_MASK = "radial-gradient(ellipse 110% 90% at 50% 25%, black 55%, transparent 100%)";

export function AmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Forensic grid — the corpus substrate, lightly masked toward the edges.
          Grid colour flips with the theme (white on ink, ink on paper). */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(var(--ambient-grid), 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(var(--ambient-grid), 0.55) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: EDGE_MASK,
          WebkitMaskImage: EDGE_MASK,
        }}
      />

      {/* Drifting glow orbs — colour and depth at every scroll position, sitting
          beneath the network so the graph reads crisply on top. Hues flip with
          the theme (lime/green on dark, deep greens on light). */}
      <div
        className="cg-drift absolute left-[-6%] top-[-8%] h-[62vh] w-[62vh] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(closest-side, rgba(var(--ambient-net), 0.26), transparent 70%)",
        }}
      />
      <div
        className="cg-float absolute right-[-8%] top-[36%] h-[60vh] w-[60vh] rounded-full blur-[130px]"
        style={{
          background: "radial-gradient(closest-side, rgba(var(--ambient-net-2), 0.24), transparent 70%)",
        }}
      />
      <div
        className="cg-breathe absolute bottom-[-14%] left-[16%] h-[56vh] w-[68vh] rounded-full blur-[130px]"
        style={{
          background: "radial-gradient(closest-side, rgba(var(--ambient-net), 0.18), transparent 70%)",
        }}
      />

      {/* Citation network — the living corpus graph, the page's primary motion */}
      <CitationNetworkCanvas />

      {/* Grain for texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: `url("${GRAIN}")`, backgroundSize: "180px 180px" }}
      />
    </div>
  );
}
