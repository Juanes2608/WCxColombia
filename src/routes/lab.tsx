import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BACKGROUNDS } from "@/components/motion/backgrounds";
import { ProcessingOrbit } from "@/components/motion/ProcessingOrbit";

// Internal playground — open /lab directly (not linked from the site). Shows the
// ProcessingOrbit "working" animation, and lets you audition each background
// behind it via the bottom bar (the `key` remount restarts cleanly).

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [{ title: "TraceIt background lab" }],
  }),
  component: Lab,
});

function Lab() {
  const [active, setActive] = useState(BACKGROUNDS[0].id);
  const current = BACKGROUNDS.find((b) => b.id === active) ?? BACKGROUNDS[0];
  const Bg = current.Component;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink-fixed text-paper-fixed">
      <Bg key={active} />

      {/* Sample hero, so each background is judged in real context */}
      <div className="relative z-10 mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-6 pb-44 pt-24 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-action">
            Processing animation
          </p>
          <h1 className="mt-6 font-editorial text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
            The corpus,
            <br />
            <span className="mark-lime">in motion.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-paper-fixed/55">
            The &ldquo;working&rdquo; animation (orbiting nodes around the TraceIt scan-frame),
            shown wherever the app is processing: verifying a filing or loading a report. Pick a
            background below to see it in context.
          </p>
        </div>
        <ProcessingOrbit
          className="h-[360px] w-full"
          label="Verifying every authority against the corpus…"
          sublabel="Deterministic lookup in progress"
        />
      </div>

      {/* Switcher */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-fixed/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-widest text-paper-fixed/40">
              Fondo
            </span>
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActive(b.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
                  b.id === active
                    ? "bg-accent-lime text-ink-fixed"
                    : "bg-white/5 text-paper-fixed/70 hover:bg-white/10"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-paper-fixed/55">
            <span className="font-semibold text-paper-fixed/85">{current.name}.</span>{" "}
            {current.desc}
          </p>
        </div>
      </div>
    </div>
  );
}
