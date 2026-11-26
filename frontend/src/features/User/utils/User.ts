import { getRequest } from "../../../lib/api";
import { ApplicationType } from "../../../lib/types";

export async function getProfile(pk: number, signal: AbortSignal) {
    return getRequest(`/api/user/${pk}`, signal);
}
/** A page of the user's own applications, the latest competition first. */
export type ApplicationPageType = {
    count: number;
    next: string | null;
    previous: string | null;
    results: ApplicationType[];
};

/**
 * The criteria of the historic search, all optional: the competition starts
 * between the dates (YYYY-MM-DD, both included), takes place at a location
 * matching `location`, has one of the statuses and contains `search`.
 */
export type HistoricSearchType = {
    start_after: string;
    start_before: string;
    location: string;
    status: number[];
    search: string;
};

export const NO_HISTORIC_SEARCH: HistoricSearchType = {
    start_after: "", start_before: "", location: "", status: [], search: "",
};

/** Whether no criterion is given. */
export function isEmptySearch(criteria: HistoricSearchType): boolean {
    return !criteria.start_after && !criteria.start_before && !criteria.location.trim()
        && criteria.status.length === 0 && !criteria.search.trim();
}

/** The query string of a page of applications matching the criteria, empty for the first page of all. */
export function applicationQuery(page: number, criteria?: HistoricSearchType): string {
    const params = new URLSearchParams();
    if (criteria) {
        if (criteria.start_after) params.append("start_after", criteria.start_after);
        if (criteria.start_before) params.append("start_before", criteria.start_before);
        if (criteria.location.trim()) params.append("location", criteria.location.trim());
        criteria.status.forEach((status) => params.append("status", String(status)));
        if (criteria.search.trim()) params.append("search", criteria.search.trim());
    }
    if (page > 1) params.append("page", String(page));
    const query = params.toString();
    return query ? `?${query}` : "";
}

export async function getApplications(
    page: number, signal: AbortSignal, criteria?: HistoricSearchType,
): Promise<ApplicationPageType> {
    return getRequest(`/api/applications/${applicationQuery(page, criteria)}`, signal);
}
export async function getExaminations(signal: AbortSignal) {
    return getRequest("/api/examinations/user/", signal)
}

/** A sent invitation as its invited referees read it. */
export type ReceivedInvitationType = {
    subject: string;
    message: string;
    sent: string;
    sender: string | null;
    /** Whether it replaces an invitation sent before. */
    is_update: boolean;
    event_name: string;
    location: string;
    address: string;
    start: string;
    end: string;
    info: string;
    /** The head referee first, then by name. */
    referees: { name: string; head: boolean }[];
};

/** The invitation sent last for one of the user's own applications. */
export async function getReceivedInvitation(application: number, signal: AbortSignal): Promise<ReceivedInvitationType> {
    return getRequest(`/api/applications/${application}/invitation/`, signal);
}
