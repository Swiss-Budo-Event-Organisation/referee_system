import { describe, expect, it } from "vitest";
import { filterWrapperText } from "./Events";
import { applicationStatusClass, applicationStatusInfo } from "./Application";
import { type EventType } from "../../../lib/types";

const event: EventType = {
  id: 1,
  name: "Swiss Open",
  info: "Annual tournament",
  location: { id: 1, name: "Dojo Bern", description: "", address: 5 },
  slug: "swiss-open",
  creator: null,
  created: "2024-01-01T00:00",
  modified: "2024-01-01T00:00",
  start: "2024-12-01T09:00",
  end: null,
};

describe("filterWrapperText", () => {
  it("matches name, info, date and location case-insensitively", () => {
    for (const term of ["", "swiss", "ANNUAL", "dec 2024", "bern"]) {
      expect(filterWrapperText(term)(event)).toBe(true);
    }
    expect(filterWrapperText("zurich")(event)).toBe(false);
  });
});

describe("application status", () => {
  it("maps status codes", () => {
    expect(applicationStatusClass(0)).toBe("applied");
    expect(applicationStatusClass(-4)).toBe("no-show");
    expect(applicationStatusClass(99)).toBe("");
    expect(applicationStatusInfo(2)).toMatch(/invitation has been sent/);
  });
});
