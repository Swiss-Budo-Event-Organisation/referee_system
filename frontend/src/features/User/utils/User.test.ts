import { describe, expect, it } from "vitest";
import { applicationQuery, isEmptySearch, NO_HISTORIC_SEARCH } from "./User";

describe("applicationQuery", () => {
    it("asks for the first page of all applications without parameters", () => {
        expect(applicationQuery(1)).toBe("");
        expect(applicationQuery(3)).toBe("?page=3");
    });

    it("leaves out the criteria not given", () => {
        expect(applicationQuery(1, { ...NO_HISTORIC_SEARCH, location: "  Bern  " })).toBe("?location=Bern");
    });

    it("repeats the statuses and adds the page last", () => {
        expect(applicationQuery(2, {
            start_after: "2010-01-01", start_before: "2012-01-01", location: "", status: [2, -4], search: "kata cup",
        })).toBe("?start_after=2010-01-01&start_before=2012-01-01&status=2&status=-4&search=kata+cup&page=2");
    });
});

describe("isEmptySearch", () => {
    it("ignores blanks", () => {
        expect(isEmptySearch({ ...NO_HISTORIC_SEARCH, search: "  " })).toBe(true);
        expect(isEmptySearch({ ...NO_HISTORIC_SEARCH, status: [0] })).toBe(false);
    });
});
