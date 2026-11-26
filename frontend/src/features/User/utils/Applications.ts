import { formattedDateRange } from "../../../lib/helper";
import { ApplicationType } from "../../../lib/types";

/** The tabs of the user's applications. */
export type ApplicationTab = "upcoming" | "invited" | "past" | "all";

export const APPLICATION_TABS: { key: ApplicationTab; title: string }[] = [
    { key: "upcoming", title: "Upcoming" },
    { key: "invited", title: "Invited" },
    { key: "past", title: "Past invitations" },
    { key: "all", title: "All" },
];

/** Competitions on the day of `now` still count as upcoming. */
function isUpcoming(app: ApplicationType, now: Date): boolean {
    const start = app.competition_overview?.start;
    if (start === undefined) return true;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return new Date(start) >= today;
}

function inTab(app: ApplicationType, tab: ApplicationTab, now: Date): boolean {
    switch (tab) {
        case "upcoming":
            return isUpcoming(app, now);
        case "invited":
            return isUpcoming(app, now) && Boolean(app.has_invitation);
        case "past":
            return !isUpcoming(app, now) && Boolean(app.has_invitation);
        case "all":
            return true;
    }
}

/** Whether every word of the search appears in the event, location, date or information. */
function matches(app: ApplicationType, search: string): boolean {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const competition = app.competition_overview;
    if (competition === undefined) return false;
    const text = [
        competition.event.name,
        competition.event.location?.name,
        competition.info,
        formattedDateRange(competition.start),
    ].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
}

/**
 * The applications shown in a tab that match the search: upcoming ones
 * soonest first, past ones and all of them latest first.
 */
export function filterApplications(
    applications: ApplicationType[], tab: ApplicationTab, search: string, now: Date = new Date(),
): ApplicationType[] {
    const start = (app: ApplicationType) => new Date(app.competition_overview?.start ?? 0).getTime();
    const direction = tab === "past" || tab === "all" ? -1 : 1;
    return applications
        .filter((app) => inTab(app, tab, now) && matches(app, search))
        .sort((a, b) => direction * (start(a) - start(b)));
}
