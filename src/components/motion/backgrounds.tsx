// A gallery of candidate animated backgrounds for the landing — all in the
// forensic dark-luxury language (ink base, lime/green accents). Each is a
// self-contained layer meant to sit behind content. Used by the /lab route so
// the whole set can be auditioned live instead of iterating one at a time.

import { useEffect, useRef, type ComponentType } from "react";
import { useReducedMotion } from "framer-motion";
import { CitationNetworkCanvas } from "./CitationNetworkCanvas";

const GRID_MASK = "radial-gradient(ellipse 110% 90% at 50% 25%, black 55%, transparent 100%)";

function Grid({ size = 64, opacity = 0.08 }: { size?: number; opacity?: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        opacity,
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.55) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        maskImage: GRID_MASK,
        WebkitMaskImage: GRID_MASK,
      }}
    />
  );
}

function Glow({
  className,
  color,
  size = "58vh",
  blur = "120px",
}: {
  className?: string;
  color: string;
  size?: string;
  blur?: string;
}) {
  return (
    <div
      className={`absolute rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        filter: `blur(${blur})`,
        background: `radial-gradient(closest-side, ${color}, transparent 70%)`,
      }}
    />
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">{children}</div>
);

// 1 — Grid Scan: a lime band periodically sweeps the forensic grid.
function GridScan() {
  return (
    <Shell>
      <Grid />
      <Glow className="cg-drift left-[-6%] top-[-8%]" color="rgba(198,240,53,0.30)" />
      <Glow className="cg-float right-[-8%] top-[36%]" color="rgba(95,140,0,0.28)" />
      <div className="cg-grid-scan absolute inset-x-0 top-0 h-[200px] will-change-transform">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(198,240,53,0.14) 50%, transparent)",
          }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent-lime/50 shadow-[0_0_22px_5px_rgba(198,240,53,0.4)]" />
      </div>
    </Shell>
  );
}

// 2 — Radar: a sweep cone rotates continuously over the grid.
function Radar() {
  return (
    <Shell>
      <Grid opacity={0.06} />
      <Glow
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        color="rgba(198,240,53,0.16)"
        size="48vh"
      />
      <div
        className="cg-spin-med absolute left-1/2 top-1/2 h-[170vh] w-[170vh] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 will-change-transform"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(198,240,53,0.20) 0deg, rgba(198,240,53,0.05) 22deg, transparent 64deg 360deg)",
        }}
      />
    </Shell>
  );
}

// 3 — Sonar Pulse: concentric rings expand from the centre, staggered.
const SONAR_DELAYS = [0, 1.15, 2.3, 3.45];
function Sonar() {
  return (
    <Shell>
      <Grid opacity={0.05} />
      <Glow
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        color="rgba(198,240,53,0.12)"
        size="38vh"
      />
      {SONAR_DELAYS.map((d) => (
        <div
          key={d}
          className="cg-sonar absolute left-1/2 top-1/2 h-[72vh] w-[72vh] rounded-full border border-accent-lime/40 will-change-transform"
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </Shell>
  );
}

// 4 — Aurora Drift: large soft colour fields drift more perceptibly.
function Aurora() {
  return (
    <Shell>
      <Glow
        className="cg-drift left-[-10%] top-[-15%]"
        color="rgba(198,240,53,0.40)"
        size="72vh"
        blur="100px"
      />
      <Glow
        className="cg-float right-[-12%] top-[18%]"
        color="rgba(95,140,0,0.38)"
        size="72vh"
        blur="110px"
      />
      <Glow
        className="cg-breathe left-[18%] bottom-[-22%]"
        color="rgba(198,240,53,0.30)"
        size="78vh"
        blur="110px"
      />
      <Glow
        className="cg-drift left-[42%] top-[28%]"
        color="rgba(120,175,25,0.26)"
        size="56vh"
        blur="120px"
      />
    </Shell>
  );
}

// 5 — Dot Field: a dot matrix lit by drifting illumination, with a few twinkles.
const TWINKLES = [
  { l: "12%", t: "22%", d: 0 },
  { l: "28%", t: "60%", d: 1.2 },
  { l: "44%", t: "33%", d: 2.1 },
  { l: "61%", t: "70%", d: 0.6 },
  { l: "73%", t: "20%", d: 1.8 },
  { l: "85%", t: "52%", d: 2.6 },
  { l: "18%", t: "80%", d: 1.0 },
  { l: "52%", t: "12%", d: 2.3 },
  { l: "67%", t: "44%", d: 0.3 },
  { l: "90%", t: "74%", d: 1.5 },
];
function DotField() {
  return (
    <Shell>
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.14,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1.2px, transparent 1.5px)",
          backgroundSize: "30px 30px",
          maskImage: GRID_MASK,
          WebkitMaskImage: GRID_MASK,
        }}
      />
      <Glow className="cg-drift left-[8%] top-[6%]" color="rgba(198,240,53,0.30)" size="56vh" />
      <Glow className="cg-float right-[6%] bottom-[2%]" color="rgba(95,140,0,0.28)" size="56vh" />
      {TWINKLES.map((t) => (
        <span
          key={`${t.l}-${t.t}`}
          className="cg-breathe absolute h-1 w-1 rounded-full bg-accent-lime/70"
          style={{ left: t.l, top: t.t, animationDelay: `${t.d}s` }}
        />
      ))}
    </Shell>
  );
}

// 6 — Perspective Grid: a synthwave-style grid plane scrolling toward you.
function Perspective() {
  return (
    <Shell>
      <Glow
        className="left-1/2 top-[52%] -translate-x-1/2"
        color="rgba(198,240,53,0.22)"
        size="62vh"
      />
      <div
        className="absolute inset-x-0 bottom-[-8%] top-[46%]"
        style={{
          perspective: "300px",
          perspectiveOrigin: "50% 0%",
          maskImage: "linear-gradient(to bottom, transparent, black 38%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 38%)",
        }}
      >
        <div className="absolute inset-0 origin-top" style={{ transform: "rotateX(72deg)" }}>
          <div
            className="cg-grid-fly absolute will-change-transform"
            style={{
              left: "-60%",
              right: "-60%",
              top: "-30%",
              bottom: "-160%",
              backgroundImage:
                "linear-gradient(to right, rgba(198,240,53,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(198,240,53,0.45) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
        </div>
      </div>
    </Shell>
  );
}

// 7 — Citation Network: drifting nodes connected by edges (the corpus as a
// citation graph), with nodes that softly pulse. Canvas. Shared with the
// production AmbientBackground via CitationNetworkCanvas.
function CitationNetwork() {
  return (
    <Shell>
      <CitationNetworkCanvas />
    </Shell>
  );
}

// 8 — Spotlight: a lime light follows the cursor, lighting the dots near it.
const DOTS = "radial-gradient(rgba(255,255,255,0.5) 1.2px, transparent 1.5px)";
const DOTS_LIME = "radial-gradient(rgba(198,240,53,0.9) 1.3px, transparent 1.6px)";
function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const cursorMask = "radial-gradient(240px circle at var(--mx) var(--my), black, transparent 72%)";
  return (
    <Shell>
      <div
        ref={ref}
        className="absolute inset-0"
        style={{ "--mx": "50%", "--my": "42%" } as React.CSSProperties}
      >
        <div
          className="absolute inset-0"
          style={{ opacity: 0.1, backgroundImage: DOTS, backgroundSize: "30px 30px" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(300px circle at var(--mx) var(--my), rgba(198,240,53,0.13), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.6,
            backgroundImage: DOTS_LIME,
            backgroundSize: "30px 30px",
            maskImage: cursorMask,
            WebkitMaskImage: cursorMask,
          }}
        />
      </div>
    </Shell>
  );
}

// 9 — Flow Lines: smooth sine ribbons that drift and undulate. Canvas.
function FlowLines() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const LINES = 9;
    const render = (time: number) => {
      const tt = time * 0.0004;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < LINES; i++) {
        const yBase = (h * (i + 0.5)) / LINES;
        const amp = 24 + i * 4;
        const phase = i * 0.7 + tt * (1 + i * 0.05);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y =
            yBase +
            Math.sin(x * 0.006 + phase) * amp +
            Math.sin(x * 0.013 + phase * 1.7) * amp * 0.4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(198,240,53,0.10)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    };

    if (reduce) {
      render(0);
    } else {
      const loop = (t: number) => {
        render(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduce]);

  return (
    <Shell>
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full"
        style={{ maskImage: GRID_MASK, WebkitMaskImage: GRID_MASK }}
      />
    </Shell>
  );
}

// 10 — HUD: rotating concentric arcs, like a forensic monitoring instrument.
function Hud() {
  return (
    <Shell>
      <Grid opacity={0.05} />
      <Glow
        className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        color="rgba(198,240,53,0.12)"
        size="42vh"
      />
      <div className="cg-spin-med absolute left-1/2 top-1/2 h-[82vh] w-[82vh] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent-lime/15" />
      <div className="cg-spin-rev-med absolute left-1/2 top-1/2 h-[58vh] w-[58vh] -translate-x-1/2 -translate-y-1/2 rounded-full border-y-2 border-accent-lime/25" />
      <div className="cg-spin-med absolute left-1/2 top-1/2 h-[36vh] w-[36vh] -translate-x-1/2 -translate-y-1/2 rounded-full border-l-2 border-t-2 border-accent-lime/35" />
    </Shell>
  );
}

export interface BgVariant {
  id: string;
  name: string;
  desc: string;
  Component: ComponentType;
}

export const BACKGROUNDS: BgVariant[] = [
  {
    id: "network",
    name: "Citation Network",
    desc: "Un grafo de nodos conectados que deriva — las citas/casos como una red viva. Muy temático.",
    Component: CitationNetwork,
  },
  {
    id: "spotlight",
    name: "Spotlight",
    desc: "Un foco lime sigue tu cursor e ilumina los puntos a su paso. Interactivo — mueve el mouse.",
    Component: Spotlight,
  },
  {
    id: "flow",
    name: "Flow Lines",
    desc: "Líneas que fluyen y ondulan suavemente. Orgánico y elegante, sin tema técnico.",
    Component: FlowLines,
  },
  {
    id: "hud",
    name: "HUD Forense",
    desc: "Arcos concéntricos que rotan, como un instrumento de monitoreo forense.",
    Component: Hud,
  },
  {
    id: "grid-scan",
    name: "Grid Scan",
    desc: "Una banda lime barre la rejilla forense de arriba a abajo, periódica. (la actual)",
    Component: GridScan,
  },
  {
    id: "radar",
    name: "Radar",
    desc: "Un cono de luz gira continuo sobre la rejilla, como un monitor en vigilancia.",
    Component: Radar,
  },
  {
    id: "sonar",
    name: "Sonar Pulse",
    desc: "Anillos concéntricos que se expanden desde el centro, como un pulso de sonar.",
    Component: Sonar,
  },
  {
    id: "aurora",
    name: "Aurora Drift",
    desc: "Campos de color suaves que derivan más perceptiblemente. Atmósfera pura, sin tema técnico.",
    Component: Aurora,
  },
  {
    id: "dots",
    name: "Dot Field",
    desc: "Matriz de puntos iluminada por luz que deriva, con algunos puntos que titilan. Corpus vivo.",
    Component: DotField,
  },
  {
    id: "perspective",
    name: "Perspective Grid",
    desc: "Una rejilla en perspectiva que avanza hacia ti (estilo synthwave), sutil y en lime.",
    Component: Perspective,
  },
];
