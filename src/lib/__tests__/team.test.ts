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
