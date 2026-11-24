import { getRequest } from "../../../lib/api";

export async function getProfile(pk: number, signal: AbortSignal) {
    return getRequest(`/api/user/${pk}`, signal);
}
export async function getApplications(signal: AbortSignal) {
    return getRequest("/api/applications/", signal);
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
