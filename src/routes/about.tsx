import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { Linkedin } from "lucide-react";
import { Nav, Closing, Footer } from "@/components/citationguard/SiteChrome";
import { TEAM, getInitials, type TeamMember } from "@/lib/team";

// Strong ease-out curve (Emil) for the header entrance — matches /pricing.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "TraceIt — the team" },
      {
        name: "description",
        content:
          "The people behind TraceIt: a lawyer, a systems engineer and a finance lead building deterministic citation integrity for litigation.",
      },
      { property: "og:title", content: "TraceIt — the team" },
      {
        property: "og:description",
        content:
          "Meet the interdisciplinary team building deterministic citation integrity for legal filings.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AboutPage,
});

function Avatar({ member }: { member: TeamMember }) {
  if (member.photo) {
    return (
      <img
        src={member.photo}
        alt={member.name}
        width={64}
        height={64}
        loading="lazy"
        className="h-16 w-16 rounded-full object-cover ring-2 ring-accent-lime"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-ink font-display text-lg font-semibold text-paper ring-2 ring-accent-lime"
    >
      {member.initials ?? getInitials(member.name)}
    </span>
  );
}

function TeamCard({ member }: { member: TeamMember }) {
  return (
    <li className="flex flex-col rounded-2xl border border-n300 bg-surface p-7">
      <div className="flex items-center gap-4">
        <Avatar member={member} />
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{member.name}</h3>
          <p className="font-mono text-[11px] uppercase tracking-widest text-action">
            {member.role}
          </p>
        </div>
      </div>
      <p className="mt-5 flex-1 text-sm text-n500">{member.bio}</p>
      <a
        href={member.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${member.name} on LinkedIn`}
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-action"
      >
        <Linkedin className="h-4 w-4" /> LinkedIn
      </a>
    </li>
  );
}

function AboutPage() {
  const reduce = useReducedMotion();
  return (
    <main className="relative min-h-dvh">
      <Nav current="about" />

      {/* Intro */}
      <section aria-labelledby="about-heading" className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
        <motion.div
          initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(16px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="max-w-3xl"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-action">The team</p>
          <h1
            id="about-heading"
            className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl"
          >
            Three disciplines, one <span className="mark-lime">trustworthy verdict.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-n500">
            TraceIt is built by a lawyer, a systems engineer and a finance lead. We pair courtroom
            reality with a deterministic verification engine and an honest commercial case — so
            every citation we clear is one the corpus can vouch for.
          </p>
        </motion.div>
      </section>

      {/* Team grid */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((m) => (
            <TeamCard key={m.linkedin} member={m} />
          ))}
        </ul>
      </section>

      <Closing secondaryLabel="See pricing" secondaryHref="/pricing" />
      <Footer />
    </main>
  );
}
