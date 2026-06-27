// The founding team — single source of truth for the /about page.
// Photos live in /public/team (face-centred 384px squares). If `photo` is unset,
// the Avatar falls back to a monogram of the member's initials.

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
    bio: "Lawyer who keeps TraceIt honest about doctrine. Translates how advocates actually verify authority into the product's checks.",
    linkedin: "https://www.linkedin.com/in/david-medina-09bb5a237/",
    photo: "/team/david.jpg",
  },
  {
    name: "Sara Valeria Cardona",
    role: "Engineering Lead",
    bio: "Systems engineer behind the deterministic verification pipeline, the corpus lookup that returns only what the record holds.",
    linkedin: "https://www.linkedin.com/in/sara-cardona-84010827a/",
    photo: "/team/sara.jpg",
  },
  {
    name: "Juan Esteban Cabrera",
    role: "Financial Lead",
    bio: "Builds the unit economics and buyer ROI case: pricing that proves a return, not a cost.",
    linkedin: "https://www.linkedin.com/in/juan-esteban-cabrera-623388303/",
    photo: "/team/juan.jpg",
  },
];
