import { describe, expect, it } from "vitest";
import { ApplicationType } from "../../../lib/types";
import { filterApplications } from "./Applications";

const now = new Date("2026-06-15T12:00:00");

function application(id: number, start: string, has_invitation: boolean, name = "Swiss Open", location = "Bern Arena"): ApplicationType {
    return {
        id, user: 1, created: "", modified: "", competition: id, status: 0, has_invitation,
        competition_overview: {
            id, start, info: "Kata",
            event: { id, name, start, end: null, location: { id, name: location, description: "", address: 1 } },
        },
    };
}

const later = application(1, "2026-08-01T09:00:00", false, "Zurich Cup", "Saalsporthalle");
const soon = application(2, "2026-07-01T09:00:00", true);
const today = application(3, "2026-06-15T08:00:00", false);
const old = application(4, "2025-05-01T09:00:00", true, "Geneva Open", "Palexpo");
const older = application(5, "2024-05-01T09:00:00", true);
const missed = application(6, "2026-01-01T09:00:00", false);
const all = [later, soon, today, old, older, missed];

const ids = (apps: ApplicationType[]) => apps.map((a) => a.id);

describe("filterApplications", () => {
    it("lists the upcoming applications soonest first, including today's", () => {
        expect(ids(filterApplications(all, "upcoming", "", now))).toEqual([3, 2, 1]);
    });

    it("lists the upcoming ones the user was invited to", () => {
        expect(ids(filterApplications(all, "invited", "", now))).toEqual([2]);
    });

    it("lists the past invitations latest first", () => {
        expect(ids(filterApplications(all, "past", "", now))).toEqual([4, 5]);
    });

    it("lists all applications latest first", () => {
        expect(ids(filterApplications(all, "all", "", now))).toEqual([1, 2, 3, 6, 4, 5]);
    });

    it("narrows down by event, location and date, ignoring case", () => {
        expect(ids(filterApplications(all, "upcoming", "zurich", now))).toEqual([1]);
        expect(ids(filterApplications(all, "past", "PALEXPO", now))).toEqual([4]);
        expect(ids(filterApplications(all, "past", "2024", now))).toEqual([5]);
        expect(ids(filterApplications(all, "all", "swiss", now))).toEqual([2, 3, 6, 5]);
    });

    it("needs every word of the search", () => {
        expect(ids(filterApplications(all, "upcoming", "swiss jul", now))).toEqual([2]);
        expect(ids(filterApplications(all, "upcoming", "swiss zurich", now))).toEqual([]);
    });
});
