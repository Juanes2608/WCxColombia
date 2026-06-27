// Processing indicator — the app's standard "working" animation. A field of
// nodes drifts organically (the same citation-network language as the landing
// background), forming and breaking proximity connections. Bright signals fire
// along those connections and flow inward toward a central scan-frame core —
// like data being read and computed, building toward a result. The contrast
// between the calm drifting nodes and the busy inward signals is what makes it
// read as active processing / anticipation rather than an idle screensaver. Use
// it anywhere the app has a real processing moment (scanning, loading a report).
//
// Always-dark scanner panel on purpose: the lime glow reads dramatically on the
// ink base, and a dark viewport is a deliberate, theme-consistent element (like
// the modal overlay / the AppMock) — intentional in both light and dark mode.
// Canvas 2D, DPR scaled, SSR-safe (browser access inside useEffect), and
// reduced-motion aware (freezes drift + pulse travel, keeps a gentle breathing).

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const LIME = "198,240,53";
const CORE = "220,245,160";
const TAU = Math.PI * 2;
const N = 32; // node count

interface ProcessingOrbitProps {
  /** Primary caption under the network (e.g. "Verifying authorities…"). */
  label?: string;
  /** Secondary mono caption, dimmer (e.g. "Deterministic lookup in progress"). */
  sublabel?: string;
  /** Size/rounding live here (e.g. "h-64 w-full max-w-md"). */
  className?: string;
}

export function ProcessingOrbit({ label, sublabel, className }: ProcessingOrbitProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;

    // Pre-rendered lime glow sprite, stamped under every node and the core.
    const glow = document.createElement("canvas");
    glow.width = glow.height = 64;
    const gctx = glow.getContext("2d");
    if (gctx) {
      const g = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${LIME},0.9)`);
      g.addColorStop(0.3, `rgba(${LIME},0.3)`);
      g.addColorStop(1, `rgba(${LIME},0)`);
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, 64, 64);
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
    };
    resize();
    window.addEventListener("resize", resize);

    // Drifting nodes — spread across the panel, each with its own velocity and
    // brightness phase. They persist across frames (true drift), unlike a fixed
    // orbit. Created once against the first measured size.
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      p: Math.random() * TAU,
    }));

    // Signals firing along connections, destination biased toward the core so
    // energy visibly flows inward (data being read → result building).
    const TARGET_SIGNALS = 18;
    let signals: { i: number; j: number; t: number }[] = [];

    const corner = (px: number, py: number, sx: number, sy: number, c: number) => {
      ctx.beginPath();
      ctx.moveTo(px + sx * c, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + sy * c);
      ctx.stroke();
    };

    const drawCore = (t: number, base: number) => {
      // Rhythmic "thinking" heartbeat at the core — a clear ~1.8s pulse, the most
      // recognisable "I'm working" cue, so the whole thing reads as building
      // toward a result rather than idling.
      const beat = reduce ? 0.6 : 0.5 - 0.5 * Math.cos(((t % 1.8) / 1.8) * TAU);

      // Core glow, driven by the beat.
      ctx.globalCompositeOperation = "lighter";
      const cg = base * 0.44 * (0.8 + 0.2 * beat);
      ctx.globalAlpha = 0.24 + 0.34 * beat;
      ctx.drawImage(glow, cx - cg / 2, cy - cg / 2, cg, cg);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Breathing scan-frame brackets — the TraceIt isotype, no solid fill so the
      // network shows through the centre.
      const ext = base * 0.12 * (1 + (reduce ? 0 : 0.06 * beat));
      const c = base * 0.042;
      ctx.strokeStyle = `rgba(${LIME},${(0.4 + 0.32 * beat).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, base * 0.008);
      ctx.lineCap = "round";
      corner(cx - ext, cy - ext, 1, 1, c);
      corner(cx + ext, cy - ext, -1, 1, c);
      corner(cx - ext, cy + ext, 1, -1, c);
      corner(cx + ext, cy + ext, -1, -1, c);

      // Central dot, pulsing with the beat.
      ctx.fillStyle = `rgba(${CORE},${(0.55 + 0.45 * beat).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 0.012 + beat * base * 0.012, 0, TAU);
      ctx.fill();
    };

    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);

      // Light edge vignette for depth over the flat ink panel.
      const vg = ctx.createRadialGradient(
        cx,
        cy,
        Math.min(W, H) * 0.08,
        cx,
        cy,
        Math.max(W, H) * 0.62,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      const base = Math.min(W, H);
      const breath = 0.5 + 0.5 * Math.sin(t * 1.15); // slow global pulse
      const link = base * 0.32;
      const margin = base * 0.08;

      // Drift: wander + a gentle tangential curl (swirl) + damping, soft-bounce
      // off the panel edges.
      if (!reduce) {
        for (const n of nodes) {
          n.vx += (Math.random() - 0.5) * 0.05;
          n.vy += (Math.random() - 0.5) * 0.05;
          // Soft swirl around the centre — a rotation feel without rigid orbits.
          n.vx += -(n.y - cy) * 0.00006;
          n.vy += (n.x - cx) * 0.00006;
          n.vx *= 0.985;
          n.vy *= 0.985;
          const sp = Math.hypot(n.vx, n.vy);
          if (sp > 1.1) {
            n.vx = (n.vx / sp) * 1.1;
            n.vy = (n.vy / sp) * 1.1;
          }
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < margin) {
            n.x = margin;
            n.vx = Math.abs(n.vx);
          } else if (n.x > W - margin) {
            n.x = W - margin;
            n.vx = -Math.abs(n.vx);
          }
          if (n.y < margin) {
            n.y = margin;
            n.vy = Math.abs(n.vy);
          } else if (n.y > H - margin) {
            n.y = H - margin;
            n.vy = -Math.abs(n.vy);
          }
          n.p += 0.025;
        }
      }

      // Advance signals, drop finished / broken ones, top up on live edges.
      if (!reduce) {
        for (const s of signals) s.t += 0.02;
        signals = signals.filter(
          (s) =>
            s.t < 1 &&
            Math.hypot(nodes[s.i].x - nodes[s.j].x, nodes[s.i].y - nodes[s.j].y) < link * 1.05,
        );
        let guard = 0;
        while (signals.length < TARGET_SIGNALS && guard++ < 80) {
          const i = (Math.random() * N) | 0;
          const j = (Math.random() * N) | 0;
          if (i === j) continue;
          if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) >= link) continue;
          const di = Math.hypot(nodes[i].x - cx, nodes[i].y - cy);
          const dj = Math.hypot(nodes[j].x - cx, nodes[j].y - cy);
          signals.push({ i: di > dj ? i : j, j: di > dj ? j : i, t: Math.random() * 0.25 });
        }
      }

      // Accordion swell — the whole field opens and closes around the core like a
      // slow breath. Applied only to the rendered positions: the drift/topology
      // stay in raw space, so connections stay stable while the network expands
      // and contracts (the lines stretch and compress with it).
      const swell = reduce ? 1 : 1 + 0.09 * Math.sin(t * 1.35);
      const disp = nodes.map((n) => ({
        x: cx + (n.x - cx) * swell,
        y: cy + (n.y - cy) * swell,
      }));

      // Connections between nearby nodes, brighter on the breath.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 0.8;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d < link) {
            const a = (1 - d / link) * 0.16 * (0.65 + 0.35 * breath);
            ctx.strokeStyle = `rgba(${LIME},${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(disp[i].x, disp[i].y);
            ctx.lineTo(disp[j].x, disp[j].y);
            ctx.stroke();
          }
        }
      }

      // Node glows + cores — kept calm so the moving signals read as the activity.
      for (let i = 0; i < N; i++) {
        const pulse = 0.5 + 0.5 * Math.sin(nodes[i].p);
        const gs = base * 0.02 + pulse * base * 0.015;
        ctx.globalAlpha = 0.3;
        ctx.drawImage(glow, disp[i].x - gs, disp[i].y - gs, gs * 2, gs * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${CORE},${(0.38 + pulse * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(disp[i].x, disp[i].y, base * 0.006 + pulse * base * 0.0035, 0, TAU);
        ctx.fill();
      }

      // Travelling signals — bright sparks firing along edges toward the core.
      for (const s of signals) {
        const a = disp[s.i];
        const b = disp[s.j];
        const px = a.x + (b.x - a.x) * s.t;
        const py = a.y + (b.y - a.y) * s.t;
        const fade = Math.sin(s.t * Math.PI); // bright mid-travel, fades at the ends
        const gs = base * 0.012 + base * 0.022 * fade;
        ctx.globalAlpha = 0.8 * fade;
        ctx.drawImage(glow, px - gs, py - gs, gs * 2, gs * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(${CORE},${(0.9 * fade).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, base * 0.005 * fade + 0.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      drawCore(t, base);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduce]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-accent-lime/15 bg-ink-fixed shadow-[0_24px_70px_-24px_rgba(0,0,0,0.45)] ring-1 ring-accent-lime/10",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Processing"}
    >
      <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      {(label || sublabel) && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink-fixed via-ink-fixed/80 to-transparent px-4 pb-5 pt-8 text-center">
          {label && (
            <p className="font-mono text-xs tracking-wide text-paper-fixed/75">{label}</p>
          )}
          {sublabel && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-paper-fixed/40">
              {sublabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
