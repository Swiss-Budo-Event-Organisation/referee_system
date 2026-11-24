import { isAxiosError } from "axios";
import { getRequest } from "../../../lib/api";

/** An application as shown on the invitation page. */
export type InvitationApplicationType = {
    id: number;
    user: number;
    name: string;
    status: number;
    status_display: string;
    created: string;
    has_email: boolean;
    /** False for cancelled applications and those of a past competition. */
    selectable: boolean;
};

export type InvitationDataType = {
    /** Null until a draft is saved. */
    id: number | null;
    subject: string;
    message: string;
    referees: number[];
    head_referee: number | null;
    created: string | null;
    modified: string | null;
    sent: string | null;
};

export type InvitationOverviewType = {
    competition: {
        id: number;
        event: number;
        event_name: string;
        location: string;
        start: string;
        end: string;
        info: string;
        invitor: number;
        head_referee: number | null;
        /** Number of referees needed. */
        referees: number | null;
    };
    invitation: InvitationDataType;
    last_sent: InvitationDataType | null;
    applications: InvitationApplicationType[];
    /** Only after sending: invited referees without an e-mail address. */
    missing_email?: string[];
};

export type InvitationForm = {
    referees: number[];
    headReferee: number | null;
    subject: string;
    message: string;
};

export function invitationForm(data: InvitationOverviewType): InvitationForm {
    const { invitation } = data;
    return {
        referees: invitation.referees,
        headReferee: invitation.head_referee,
        subject: invitation.subject,
        message: invitation.message,
    };
}

/** The request body; the head referee is always one of the invited. */
export function invitationPayload(form: InvitationForm) {
    const referees = [...new Set(form.referees)];
    if (form.headReferee !== null && !referees.includes(form.headReferee)) {
        referees.unshift(form.headReferee);
    }
    return {
        referees,
        head_referee: form.headReferee,
        subject: form.subject.trim(),
        message: form.message,
    };
}

/** Select or deselect a referee; deselecting the head referee also clears the head referee. */
export function toggleReferee(form: InvitationForm, referee: number): InvitationForm {
    if (form.referees.includes(referee)) {
        return {
            ...form,
            referees: form.referees.filter((r) => r !== referee),
            headReferee: form.headReferee === referee ? null : form.headReferee,
        };
    }
    return { ...form, referees: [...form.referees, referee] };
}

/** Make a referee head referee; they are invited as well. */
export function chooseHeadReferee(form: InvitationForm, referee: number | null): InvitationForm {
    if (referee === null || form.referees.includes(referee)) return { ...form, headReferee: referee };
    return { ...form, headReferee: referee, referees: [...form.referees, referee] };
}

export type InvitedReferee = { id: number; name: string; head: boolean };

/** The invited referees as listed in the e-mail: the head referee first, then by name. */
export function invitedReferees(form: InvitationForm, names: Map<number, string>): InvitedReferee[] {
    return invitationPayload(form)
        .referees.map((id) => ({ id, name: names.get(id) ?? "Unknown referee", head: id === form.headReferee }))
        .sort((a, b) => Number(b.head) - Number(a.head) || a.name.localeCompare(b.name));
}

export function errorMessages(error: unknown, fallback: string): string[] {
    if (isAxiosError(error) && error.response?.data && typeof error.response.data === "object") {
        const data = error.response.data as Record<string, unknown>;
        return Object.values(data).flatMap((value) => (Array.isArray(value) ? value.map(String) : [String(value)]));
    }
    return [fallback];
}

export async function getInvitation(competition: number, signal: AbortSignal): Promise<InvitationOverviewType> {
    return getRequest(`/api/competition/${competition}/invitation/`, signal);
}
