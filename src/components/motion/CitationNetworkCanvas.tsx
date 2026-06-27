// Citation Network — drifting nodes connected by proximity edges, rendered on a
// 2D canvas. The visual metaphor is the corpus as a living citation graph: each
// node a case/authority, each edge a citation between them, softly pulsing.
//
// Single source of truth for the animation — used both by the /lab gallery and
// by the production AmbientBackground, so the two can never drift apart.
//
// SSR-safe (all browser access inside useEffect), DPR-scaled, and reduced-motion
// aware: under prefers-reduced-motion it paints one static frame instead of
// animating. Brand colours only (acid lime).

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const GRID_MASK = "radial-gradient(ellipse 110% 90% at 50% 25%, black 55%, transparent 100%)";
// Fallback if the CSS variable can't be read (e.g. mid-hydration). Matches dark.
const FALLBACK_RGB = "198, 240, 53";

// Reads the theme-aware network colour (an "r, g, b" triplet) from --ambient-net
// so the graph keeps proper contrast in both light and dark mode.
function readNetworkRgb(): string {
  if (typeof window === "undefined") return FALLBACK_RGB;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--ambient-net").trim();
  return v || FALLBACK_RGB;
}

interface CitationNetworkCanvasProps {
  /** Number of nodes in the graph. */
  count?: number;
  /** Max pixel distance at which two nodes are linked by an edge. */
  linkDistance?: number;
  /** Optional extra classes for the canvas element. */
  className?: string;
  /** Mask applied to fade the graph toward the edges. */
  mask?: string;
}

export function CitationNetworkCanvas({
  count = 46,
  linkDistance = 155,
  className,
  mask = GRID_MASK,
}: CitationNetworkCanvasProps) {
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

    // Theme-aware colour, re-read whenever the .dark class on <html> toggles so
    // the network recolours instantly without restarting the animation.
    let rgb = readNetworkRgb();
    const themeObserver = new MutationObserver(() => {
      rgb = readNetworkRgb();
      // Under reduced-motion there's no loop, so repaint the static frame to
      // pick up the new colour immediately.
      if (reduce) step();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

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

    const nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.6 + 0.9,
      p: Math.random() * Math.PI * 2,
    }));

    const step = () => {
      ctx.clearRect(0, 0, w, h);
      // Edges: link any two nodes closer than linkDistance, fading with distance.
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d < linkDistance) {
            ctx.strokeStyle = `rgba(${rgb}, ${(1 - d / linkDistance) * 0.16})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      // Nodes: drift, bounce off edges, and softly pulse.
      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
          n.p += 0.02;
        }
        const glow = 0.5 + 0.5 * Math.sin(n.p);
        ctx.fillStyle = `rgba(${rgb}, ${0.35 + glow * 0.45})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduce) {
      step();
    } else {
      const loop = () => {
        step();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      themeObserver.disconnect();
    };
  }, [reduce, count, linkDistance]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full ${className ?? ""}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
