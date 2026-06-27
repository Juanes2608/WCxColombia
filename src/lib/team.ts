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
