import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BACKGROUNDS } from "@/components/motion/backgrounds";
import { AppMock } from "@/components/citationguard/AppMock";

// Internal playground to audition background animations live. Not linked from
// the site — open /lab directly. Pick a background from the bottom bar; the
// `key` remount restarts each animation cleanly so the comparison is fair.

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
            Citation integrity for the Bar
          </p>
          <h1 className="mt-6 font-editorial text-5xl font-medium leading-[1.0] tracking-tight sm:text-6xl">
            Because the AI invents.
            <br />
            <span className="mark-lime">The corpus doesn&rsquo;t.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-paper-fixed/55">
            Upload a skeleton argument and TraceIt checks every authority against the real
            corpus before it reaches the court: does it exist, is it applied correctly, is it
            still good law?
          </p>
        </div>
        <AppMock />
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
