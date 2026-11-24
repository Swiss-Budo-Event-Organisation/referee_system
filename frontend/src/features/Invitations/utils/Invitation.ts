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
    /** Users who get a copy of the e-mail. */
    copy_users: number[];
    /** Further e-mail addresses that get a copy. */
    copy_emails: string[];
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
    copyUsers: number[];
    copyEmails: string[];
};

export function invitationForm(data: InvitationOverviewType): InvitationForm {
    const { invitation } = data;
    return {
        referees: invitation.referees,
        headReferee: invitation.head_referee,
        subject: invitation.subject,
        message: invitation.message,
        copyUsers: invitation.copy_users ?? [],
        copyEmails: invitation.copy_emails ?? [],
    };
}

/** A plausible e-mail address; the server checks it properly. */
export function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Add an e-mail address to the further recipients. Returns an error message
 * instead when the address is not valid or already added.
 */
export function addCopyEmail(form: InvitationForm, value: string): InvitationForm | string {
    const email = value.trim();
    if (!isEmail(email)) return "Enter a valid e-mail address.";
    if (form.copyEmails.some((e) => e.toLowerCase() === email.toLowerCase())) return "This address was already added.";
    return { ...form, copyEmails: [...form.copyEmails, email] };
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
        copy_users: [...new Set(form.copyUsers)],
        copy_emails: form.copyEmails,
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
        return flatten(error.response.data);
    }
    return [fallback];
}

/** Messages of a DRF error, also nested ones such as {"copy_emails": {"0": [...]}}. */
function flatten(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
    return [String(value)];
}

export async function getInvitation(competition: number, signal: AbortSignal): Promise<InvitationOverviewType> {
    return getRequest(`/api/competition/${competition}/invitation/`, signal);
}
