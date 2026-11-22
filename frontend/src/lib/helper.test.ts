import { describe, expect, it } from "vitest";
import { extractDay, extractTime, formatDate, formattedDateRange, license } from "./helper";

describe("helper", () => {
  it("formats dates in en-GB", () => {
    expect(formatDate(new Date(2024, 11, 1))).toBe("1 Dec 2024");
  });

  it("formats date ranges", () => {
    expect(formattedDateRange("2024-12-01T10:00")).toBe("1 Dec 2024");
    expect(formattedDateRange("2024-12-01T10:00", "2024-12-01T18:00")).toBe("1 Dec 2024");
    expect(formattedDateRange("2024-12-01T10:00", "2024-12-02T18:00")).toBe(
      "1 Dec 2024 - 2 Dec 2024",
    );
  });

  it("extracts day and time", () => {
    expect(extractDay("2024-12-01T09:05")).toBe("Sunday (1 Dec)");
    expect(extractTime("2024-12-01T09:05")).toBe("09:05");
  });

  it("looks up license names", () => {
    const licenses = [
      { id: 1, name: "Regional" },
      { id: 2, name: "National B" },
    ];
    expect(license(2, licenses)).toBe("National B");
    expect(license(3, licenses)).toBeUndefined();
  });
});
