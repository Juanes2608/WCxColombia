# About Page (`/about`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/about` ("About us") page introducing the three-person founding team, and route the "About" nav link and both "Talk to the team" buttons to it.

**Architecture:** New file-based TanStack route `src/routes/about.tsx` reusing the shared brand chrome (`Nav`/`Closing`/`Footer`). Team data + the only logic (`getInitials`) live in a small `src/lib/team.ts` module (mirrors how `src/routes/pricing.tsx` consumes `src/lib/pricing.ts`), unit-tested with vitest. Photos are placeholder monogram avatars; a `photo?` field reserves real images for later. `Closing` gains optional secondary-CTA props so the shared "Talk to the team" button points to `/about` everywhere, while `/about` itself overrides it to "See pricing" (no self-link).

**Tech Stack:** React 19, TanStack Router/Start, TailwindCSS v4, framer-motion, lucide-react, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-27-about-page-design.md`

**Ordering constraint:** TanStack's typed `<Link to="/about">` only compiles after `src/routes/about.tsx` exists and `routeTree.gen.ts` regenerates (via `npm run build`/`dev`). Therefore the route file is created in the SAME task that introduces `/about` links (Task 2), and the pricing link is repointed only afterward (Task 3).

---

### Task 1: Team data module + `getInitials` (TDD)

**Files:**
- Create: `src/lib/team.ts`
- Test: `src/lib/__tests__/team.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/team.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getInitials } from "@/lib/team";

describe("getInitials", () => {
  it("returns the first two initials of a multi-word name", () => {
    // Arrange / Act
    const result = getInitials("David Alejandro Medina");
    // Assert
    expect(result).toBe("DA");
  });

  it("returns a single initial for a one-word name", () => {
    expect(getInitials("Sara")).toBe("S");
  });

  it("collapses leading, trailing and repeated whitespace", () => {
    expect(getInitials("  Juan   Esteban  Cabrera ")).toBe("JE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/team.test.ts`
Expected: FAIL — cannot resolve `@/lib/team` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/team.ts`:

```ts
// The founding team — single source of truth for the /about page.
// Photos are placeholders for now (monogram avatars). Drop real images into
// /public/team and set `photo` to swap them in without touching layout.

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  linkedin: string;
  photo?: string;
  initials?: string;
}

/** First letter of the first two words, uppercased. "David A. Medina" -> "DA". */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export const TEAM: TeamMember[] = [
  {
    name: "David Alejandro Medina",
    role: "Legal Lead",
    bio: "Lawyer who keeps TraceIt honest about doctrine — translating how advocates actually verify authority into the product's checks.",
    linkedin: "https://www.linkedin.com/in/david-medina-09bb5a237/",
  },
  {
    name: "Sara Valeria Cardona",
    role: "Engineering Lead",
    bio: "Systems engineer behind the deterministic verification pipeline — the corpus lookup that returns only what the record holds.",
    linkedin: "https://www.linkedin.com/in/sara-cardona-84010827a/",
  },
  {
    name: "Juan Esteban Cabrera",
    role: "Financial Lead",
    bio: "Builds the unit economics and buyer ROI case — pricing that proves a return, not a cost.",
    linkedin: "https://www.linkedin.com/in/juan-esteban-cabrera-623388303/",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/team.test.ts`
Expected: PASS — 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team.ts src/lib/__tests__/team.test.ts
git commit -m "feat(about): team data module + getInitials helper"
```

---

### Task 2: Wire brand chrome to `/about` and create the route

**Files:**
- Modify: `src/components/citationguard/SiteChrome.tsx` (Nav type + About link; Closing secondary props)
- Create: `src/routes/about.tsx`

- [ ] **Step 1: Widen the `Nav` type and make "About" a router link**

In `src/components/citationguard/SiteChrome.tsx`:

Replace the `NAV_LINKS` constant (remove the About entry — it becomes a typed `<Link>`):

```tsx
const NAV_LINKS = [
  { href: "/#demo", label: "Product" },
  { href: "/#engines", label: "How it works" },
];
```

Change the `Nav` signature to allow `"about"`:

```tsx
export function Nav({ current }: { current?: "landing" | "pricing" | "about" }) {
```

Inside the `<nav>`, immediately BEFORE the existing `Pricing` `<Link>`, add an About link:

```tsx
          <Link
            to="/about"
            className={`text-sm font-medium transition-colors hover:text-ink ${
              current === "about" ? "text-ink" : "text-n500"
            }`}
          >
            About
          </Link>
```

- [ ] **Step 2: Add secondary-CTA props to `Closing` and route its button to `/about`**

Still in `src/components/citationguard/SiteChrome.tsx`, change the `Closing` declaration from `export function Closing() {` to accept optional props with defaults:

```tsx
export function Closing({
  secondaryLabel = "Talk to the team",
  secondaryHref = "/about",
}: {
  secondaryLabel?: string;
  secondaryHref?: "/about" | "/pricing" | "/scan";
} = {}) {
```

Then replace the secondary anchor (currently `<a href="/#faq"> ... Talk to the team <ArrowRight/></a>`) with a router link using the props:

```tsx
          <Link
            to={secondaryHref}
            className="inline-flex items-center gap-2 rounded-lg border border-paper-fixed/25 px-6 py-3 text-sm font-semibold text-paper-fixed transition hover:border-paper-fixed active:scale-[0.97]"
          >
            {secondaryLabel} <ArrowRight className="h-4 w-4" />
          </Link>
```

(`Link` and `ArrowRight` are already imported at the top of this file — no new imports.)

- [ ] **Step 3: Create the `/about` route**

Create `src/routes/about.tsx`:

```tsx
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
```

- [ ] **Step 4: Build to regenerate the route tree and verify it compiles**

Run: `npm run build`
Expected: PASS — build completes; `src/routeTree.gen.ts` now includes the `/about` route. (This is what makes `<Link to="/about">` type-valid.)

- [ ] **Step 5: Re-run the unit test to confirm nothing regressed**

Run: `npx vitest run`
Expected: PASS — all tests green (team + existing chat-client).

- [ ] **Step 6: Commit**

```bash
git add src/components/citationguard/SiteChrome.tsx src/routes/about.tsx src/routeTree.gen.ts
git commit -m "feat(about): /about team page; route About nav + Talk-to-the-team CTA to it"
```

---

### Task 3: Repoint the pricing "Talk to the team" button

**Files:**
- Modify: `src/routes/pricing.tsx` (the `ReturnCalculator` secondary CTA, currently `<a href="/#faq">Talk to the team</a>` near line 426-431)

- [ ] **Step 1: Replace the anchor with a router link to `/about`**

In `src/routes/pricing.tsx`, inside `ReturnCalculator`, replace:

```tsx
          <a
            href="/#faq"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper active:scale-[0.97]"
          >
            Talk to the team
          </a>
```

with:

```tsx
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-lg border border-paper/25 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper active:scale-[0.97]"
          >
            Talk to the team
          </Link>
```

(`Link` is already imported at the top of `pricing.tsx` — no new import.)

- [ ] **Step 2: Build to verify the typed link resolves**

Run: `npm run build`
Expected: PASS — build completes, no type error on `<Link to="/about">`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/pricing.tsx
git commit -m "feat(pricing): route Talk to the team CTA to /about"
```

---

### Task 4: Manual verification (no commit)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts; open the printed local URL.

- [ ] **Step 2: Verify the page and links**

Check, in the browser:
- `/about` renders the intro header + a 3-card team grid (David / Sara / Juan), each with a monogram avatar (DA / SV / JC), role, bio, and a working LinkedIn link that opens in a new tab to the correct profile.
- Nav "About" is highlighted as active on `/about` and navigates there via SPA (no full reload) from the landing and `/pricing`.
- "Talk to the team" on the landing closing section and on `/pricing` both navigate to `/about`.
- The `/about` closing section's secondary button reads "See pricing" and goes to `/pricing` (not a self-link).

- [ ] **Step 3: Verify both themes**

Toggle light/dark with the theme switch in the nav. Confirm the team cards, monogram avatars (`bg-ink`/`text-paper`), accent-lime ring, and text contrast all read correctly in BOTH themes (dark is the default, so light is the one that tends to slip).

---

## Self-Review

**Spec coverage:**
- `/about` route with `head()` meta → Task 2, Step 3. ✓
- `TeamMember` model + `TEAM` roster (3 members, real names/roles/bios/LinkedIn) → Task 1, Step 3. ✓
- Intro header (team + short intro) → Task 2, Step 3 (`AboutPage`). ✓
- Team grid: name, role, bio, monogram avatar, LinkedIn link → Task 2, Step 3 (`TeamCard`/`Avatar`). ✓
- `getInitials` helper, unit-tested → Task 1. ✓
- Nav: About as `<Link>`, active state, widened `current` type → Task 2, Step 1. ✓
- Closing secondary props + default to `/about`; `/about` overrides to `/pricing` → Task 2, Steps 2-3. ✓
- Repoint both "Talk to the team" buttons → Task 2 (Closing, shared) + Task 3 (pricing). ✓
- Accessibility (semantic `main`/`section aria-labelledby`/`ul`/`li`, external-link `rel`/`aria-label`, lazy images) → Task 2, Step 3. ✓
- Both-theme verification → Task 4, Step 3. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete and copy-pasteable. ✓

**Type consistency:** `TeamMember`/`getInitials`/`TEAM` defined in Task 1 are imported with the same names in Task 2. `Closing` props (`secondaryLabel`/`secondaryHref`) declared in Task 2 Step 2 match the override in Task 2 Step 3 (`secondaryLabel="See pricing"`, `secondaryHref="/pricing"`). `Nav` `current="about"` matches the widened union. ✓
