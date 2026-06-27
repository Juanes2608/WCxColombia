import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

// Animated number that counts up when scrolled into view. Renders the final
// value on the server / first paint (SSR-safe, correct with JS disabled) and
// only counts when it enters the viewport. easeOutCubic for a natural settle.

interface Props {
  to: number;
  from?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function CountUp({
  to,
  from = 0,
  durationMs = 1100,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  // Start at the final value so SSR / no-JS shows the real figure.
  const [val, setVal] = useState(to);

  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    let start: number | null = null;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    setVal(from);
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      setVal(from + (to - from) * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(to);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, to, from, durationMs]);

  const formatted = val.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
