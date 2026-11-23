import { describe, expect, it } from "vitest";
import { registrationClosedReason } from "./Competition";
import { type CompetitionType } from "../../../lib/types";

const competition: CompetitionType = {
  id: 3,
  event: 1,
  category: [1],
  competition_fields: null,
  invitor: 7,
  desired_level: 2,
  minimum_level: 1,
  start: "2030-12-01T09:00",
  info: "",
  observers: null,
  referees: null,
  duration: "08:00:00",
  application: true,
  application_open: null,
  application_close: null,
  head_referee: null,
  modified: "2024-01-01T00:00",
};
const now = new Date("2030-06-01T12:00");

describe("registrationClosedReason", () => {
  it("is open without dates until the start", () => {
    expect(registrationClosedReason(competition, now)).toBeNull();
    expect(registrationClosedReason(competition, new Date("2030-12-01T09:01"))).toBe("Registration is closed.");
  });

  it("respects opening and closing dates", () => {
    expect(registrationClosedReason({ ...competition, application_open: "2030-07-01T08:00" }, now)).toBe(
      "Registration opens on 1 Jul 2030 at 08:00.",
    );
    expect(registrationClosedReason({ ...competition, application_close: "2030-05-31T23:59" }, now)).toBe(
      "Registration is closed.",
    );
    expect(registrationClosedReason({ ...competition, application_open: "2030-05-01T00:00", application_close: "2030-07-01T00:00" }, now)).toBeNull();
  });

  it("is closed when registration is switched off", () => {
    expect(registrationClosedReason({ ...competition, application: false }, now)).toBe("Registration is not possible.");
  });
});
