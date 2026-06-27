# About page (`/about`) — design

**Date:** 2026-06-27
**Status:** Approved (pending spec review)
**Author:** Juan Esteban + Claude

## Context

TraceIt has a landing (`/`) and a `/pricing` page that share brand chrome
(`Nav`, `Closing`, `Footer` from `src/components/citationguard/SiteChrome.tsx`)
and use TanStack Router file-based routing. The "About" nav link currently jumps
to a landing section (`/#thesis`) and the two "Talk to the team" buttons jump to
`/#faq`. We want a real `/about` ("About us") page introducing the founding team,
and we want those CTAs to lead there — giving the team a face, which matters for
the HTL "would you back this team?" judging lens.

## Goals

- A `/about` route that reuses the existing brand chrome and feels like one product.
- A short intro ("who we are / why we built TraceIt") above a team grid.
- A team grid: name, role, one-line bio, placeholder avatar (monogram), LinkedIn link.
- Repoint the **About** nav link and **both** "Talk to the team" buttons to `/about`.
- Real photos can be dropped in later without touching layout.

## Non-goals (YAGNI)

- No CMS / dynamic data source — team is a small typed array in the route file.
- No real photos now (placeholder monograms; `photo?` field reserved for later).
- No moving the landing `thesis/why` content (scope chosen: "team + short intro").
- No contact form / mailto — LinkedIn links are the contact path for now.

## Decisions

| Decision | Choice |
|---|---|
| Page scope | Team grid + short intro header |
| Routing | Both the `About` nav link and all "Talk to the team" buttons → `/about` |
| Photos | Placeholder monogram avatars now; `photo?` path swapped in later |
| Structure | Single route file `src/routes/about.tsx` (mirrors `pricing.tsx`) |
| Page language | English (matches nav + landing + Cambridge judges) |

## Architecture

### New file: `src/routes/about.tsx`

- `export const Route = createFileRoute("/about")({ head, component: AboutPage })`.
- `head()` returns meta (title/description/og) in the same shape as `pricing.tsx`.
- `routeTree.gen.ts` regenerates automatically (Vite TanStack plugin) — not edited by hand.

### Data model (single source of truth, top of `about.tsx`)

```ts
interface TeamMember {
  name: string;
  role: string;        // e.g. "Legal Lead"
  bio: string;         // 1-2 sentences
  linkedin: string;    // full URL
  photo?: string;      // optional: "/team/xxx.jpg" once real photos exist
  initials?: string;   // optional override; else derived via getInitials(name)
}
```

### Team roster (final content)

```ts
const TEAM: TeamMember[] = [
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

Bios are draft copy aligned to the brand voice; editable. Roles are the English
equivalents of the source titles (Abogado / Ingeniera en sistemas / Financiero).

### Page layout (reuses brand chrome)

1. `<Nav current="about" />`
2. **Intro header** — eyebrow mono (`The team`), `font-display` title, 2-3 sentence
   lede on who we are and why we built TraceIt (placeholder copy, editable). Entrance
   animation mirrors pricing's header (`framer-motion`, `EASE_OUT`, respects reduced motion).
3. **Team grid** — `grid gap-6 sm:grid-cols-2 lg:grid-cols-3`, rendered as a
   semantic `<ul>` of `<li>` cards. Each `TeamCard`:
   - card shell matching pricing (`rounded-2xl border border-n300 bg-surface p-7`)
   - `Avatar`: `<img>` if `photo` set (with `alt`, explicit `width`/`height`,
     `loading="lazy"`); otherwise a brand-styled monogram (`bg-ink text-paper`,
     accent-lime ring) showing `getInitials(name)`
   - name (`font-display`), role (mono eyebrow or `text-action`), bio (`text-n500`)
   - LinkedIn link: lucide `Linkedin` icon + "LinkedIn", `target="_blank"`,
     `rel="noopener noreferrer"`, `aria-label={`${name} on LinkedIn`}`, designed
     hover/focus states
4. `<Closing secondaryLabel="See pricing" secondaryHref="/pricing" />`
5. `<Footer />`

### Helper: `getInitials(name: string): string`

Pure function — first letter of the first two whitespace-separated words, uppercased
(e.g. "David Alejandro Medina" → "DA"). Only piece of real logic; unit-tested.

## Changes to existing files

### `src/components/citationguard/SiteChrome.tsx`

- **Nav**: remove the `About` entry from `NAV_LINKS`; render `About` as a
  `<Link to="/about">` with active styling driven by `current === "about"`
  (same pattern as the existing `Pricing` link), for real SPA navigation +
  active highlight. Widen `current` type to `"landing" | "pricing" | "about"`.
- **Closing**: add optional props `secondaryLabel?: string` and
  `secondaryHref?: "/about" | "/pricing" | "/scan"` (narrow union so TanStack's
  typed `<Link to={...}>` stays type-safe), defaulting to `"Talk to the team"` /
  `"/about"`. The secondary CTA renders a router `<Link to={secondaryHref}>`
  (replacing today's `<a href="/#faq">`). This repoints the shared "Talk to the
  team" button to `/about` while letting the `/about` page override it to
  "See pricing" → `/pricing` (avoids a self-link). Landing and pricing keep the
  default ("Talk to the team" → `/about`).

### `src/routes/pricing.tsx`

- Repoint the `ReturnCalculator` "Talk to the team" button (currently the anchor
  `href="/#faq"` at ~line 427) to `/about` via a router `<Link to="/about">`.

## Accessibility & performance

- Semantic structure: `<main>`, `<section aria-labelledby="...">`, `<ul>`/`<li>` for members.
- External links: `target="_blank"` + `rel="noopener noreferrer"` + descriptive `aria-label`.
- Monogram avatars are decorative-with-fallback; when real `<img>` photos land they get
  `alt`, explicit dimensions, and `loading="lazy"` (no CLS, below-the-fold lazy).
- Animate only `opacity`/`transform`; honor `useReducedMotion`.
- Verify **both light and dark** themes (light-mode bugs slip because dark is default).

## Testing

- Unit test (vitest, AAA) for `getInitials`: multi-word name → first two initials;
  single word → one initial; handles extra whitespace.
- The rest is presentational, covered by visual verification in both themes.

## Out of scope / future

- Real photographs (drop into `/public/team`, set `photo` per member).
- Optional mission/values section beyond the short intro.
- Contact form or email CTA.
