import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Scroll-reveal wrapper: fades + rises its children into view once. Uses the
// same strong ease-out curve as the hero entrance for a consistent rhythm, and
// collapses to a plain fade (no movement) under prefers-reduced-motion.

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** vertical travel in px before settling */
  y?: number;
}

export function AnimatedContent({ children, className, delay = 0, y = 24 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : `translateY(${y}px)` }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: reduce ? 0 : delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
