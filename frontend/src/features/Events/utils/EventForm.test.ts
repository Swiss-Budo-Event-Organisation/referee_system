import { describe, expect, it } from "vitest";
import {
    addDays,
    buildEventPayload,
    categoryOptions,
    duration,
    emptyCompetitionDay,
    emptyEventForm,
    hasErrors,
    nextCompetitionDay,
    nowLocal,
    parseServerErrors,
    validateEventForm,
    type EventForm,
} from "./EventForm";

function filledForm(): EventForm {
    const form = emptyEventForm();
    form.name = " Swiss Open ";
    form.location = "3";
    form.competitions = [
        {
            ...emptyCompetitionDay(),
            date: "2030-12-01",
            startTime: "08:30",
            endTime: "18:00",
            category: [1, 2],
            invitor: "7",
            minimumLevel: "1",
            desiredLevel: "2",
            referees: "12",
            applicationOpen: "2030-10-01T00:00",
            applicationClose: "2030-11-15T23:59",
        },
    ];
    return form;
}

describe("dates and durations", () => {
    it("adds days across month and year ends", () => {
        expect(addDays("2030-12-31", 1)).toBe("2031-01-01");
        expect(addDays("2030-03-30", 1)).toBe("2030-03-31");
        expect(addDays("", 1)).toBe("");
    });

    it("computes the duration between two times", () => {
        expect(duration("08:30", "18:00")).toBe("09:30:00");
        expect(duration("09:00", "09:00")).toBeNull();
        expect(duration("10:00", "09:00")).toBeNull();
    });

    it("copies a day to the following day", () => {
        const day = filledForm().competitions[0];
        const next = nextCompetitionDay(day);
        expect(next.key).not.toBe(day.key);
        expect(next.date).toBe("2030-12-02");
        expect(next.applicationOpen).toBe("2030-10-01T00:00");
        expect(next.applicationClose).toBe("2030-11-15T23:59");
        expect(next.category).toEqual([1, 2]);
        expect(next.category).not.toBe(day.category);
        expect(next.invitor).toBe("7");
    });
});

describe("nowLocal", () => {
    it("formats the local time for datetime-local inputs", () => {
        expect(nowLocal(new Date(2030, 0, 5, 7, 3, 59))).toBe("2030-01-05T07:03");
    });
});

describe("categoryOptions", () => {
    it("orders categories as a tree", () => {
        const options = categoryOptions([
            { id: 3, name: "Region 1", parent: 1 },
            { id: 1, name: "National", parent: null },
            { id: 4, name: "Adapted Judo", parent: null },
            { id: 5, name: "Orphan", parent: 99 },
        ]);
        expect(options).toEqual([
            { value: 1, label: "National", level: 0 },
            { value: 3, label: "Region 1", level: 1 },
            { value: 4, label: "Adapted Judo", level: 0 },
            { value: 5, label: "Orphan", level: 0 },
        ]);
    });
});

describe("validateEventForm", () => {
    it("accepts a complete form", () => {
        expect(hasErrors(validateEventForm(filledForm()))).toBe(false);
    });

    it("reports missing fields per day", () => {
        const form = filledForm();
        form.name = "";
        form.competitions.push(emptyCompetitionDay());
        const errors = validateEventForm(form);
        expect(errors.event.name).toBeDefined();
        expect(errors.competitions[0]).toBeUndefined();
        expect(Object.keys(errors.competitions[1]).sort()).toEqual(
            ["category", "date", "desiredLevel", "invitor", "minimumLevel"],
        );
    });

    it("checks the new location and registration dates", () => {
        const form = filledForm();
        form.locationMode = "new";
        form.competitions[0].applicationClose = "2030-12-01T10:00";
        const errors = validateEventForm(form);
        expect(Object.keys(errors.newLocation).sort()).toEqual(["city", "name", "street"]);
        expect(errors.competitions[0].applicationClose).toEqual(["Registration must close before the start."]);
    });
});

describe("buildEventPayload", () => {
    it("builds the request for an existing location", () => {
        expect(buildEventPayload(filledForm())).toEqual({
            name: "Swiss Open",
            info: "",
            location: 3,
            competitions: [
                {
                    start: "2030-12-01T08:30",
                    duration: "09:30:00",
                    category: [1, 2],
                    invitor: 7,
                    head_referee: null,
                    minimum_level: 1,
                    desired_level: 2,
                    competition_fields: null,
                    referees: 12,
                    observers: null,
                    application: true,
                    application_open: "2030-10-01T00:00",
                    application_close: "2030-11-15T23:59",
                    info: "",
                },
            ],
        });
    });

    it("sends a new location and drops registration dates when closed", () => {
        const form = filledForm();
        form.locationMode = "new";
        form.newLocation = { ...form.newLocation, name: "Hall", street: "Main", city: "Bern" };
        form.competitions[0].application = false;
        const payload = buildEventPayload(form);
        expect(payload).not.toHaveProperty("location");
        expect(payload.new_location?.address).toEqual({
            street: "Main", house_number: "", area_code: "", city: "Bern", country: "Switzerland",
        });
        expect(payload.competitions[0].application_open).toBeNull();
        expect(payload.competitions[0].application_close).toBeNull();
    });
});

describe("parseServerErrors", () => {
    it("maps nested errors keyed by index", () => {
        const errors = parseServerErrors({
            name: ["Too long."],
            new_location: { name: ["Required."], address: { city: ["Required."] } },
            competitions: { 1: { category: ["Empty."], duration: ["Positive."], non_field_errors: ["Odd."] } },
        });
        expect(errors.event.name).toEqual(["Too long."]);
        expect(errors.newLocation).toEqual({ name: ["Required."], city: ["Required."] });
        expect(errors.competitions).toEqual({ 1: { category: ["Empty."], endTime: ["Positive."] } });
        expect(errors.general).toEqual(["Odd."]);
    });

    it("maps nested errors given as a list", () => {
        const errors = parseServerErrors({ competitions: [{}, { invitor: ["Invalid."] }] });
        expect(errors.competitions).toEqual({ 1: { invitor: ["Invalid."] } });
        expect(parseServerErrors({ competitions: ["Empty."] }).general).toEqual(["Empty."]);
    });

    it("falls back to a general message", () => {
        expect(parseServerErrors("Server error").general).toHaveLength(1);
    });
});
