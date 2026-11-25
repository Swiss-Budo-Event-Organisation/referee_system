import { isAxiosError } from "axios";
import api, { getRequest } from "../../../lib/api";

/** A registration waiting for a staff member's approval. */
export type PendingAccountType = {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    date_joined: string;
    /** When the registration is deleted unless approved. */
    expires: string;
};

export type GroupType = { id: number; name: string };

export type NotificationChoice = "never" | "immediate" | "daily" | "weekly";

/** The account state in the user's full profile (profile.account). */
export type AccountStateType = {
    onboarded: boolean;
    email_confirmed: boolean;
    /** Only staff members may subscribe. */
    approval_notifications: NotificationChoice;
};

export const NOTIFICATION_CHOICES: { value: NotificationChoice; label: string }[] = [
    { value: "never", label: "Never" },
    { value: "immediate", label: "Immediately" },
    { value: "daily", label: "Daily digest" },
    { value: "weekly", label: "Weekly digest" },
];

export type RegistrationData = {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    password_repeat: string;
};

/** An examination the new user already holds, recorded on approval. */
export type HeldExamination = { license: number; date: string; grade?: string };

export type ApprovalData = { groups: number[]; examinations: HeldExamination[] };

/** Field errors of a DRF response, e.g. {"email": ["..."]}. */
export type FieldErrors = Record<string, string[]>;

/**
 * The errors of a DRF response by field. Nested errors such as
 * {"referee": {"phone": [...]}} are listed under the inner field.
 */
export function fieldErrors(error: unknown): FieldErrors {
    const data = isAxiosError(error) ? error.response?.data : undefined;
    if (!data || typeof data !== "object") return { general: ["Something went wrong. Please try again."] };
    return errorsByField(data as Record<string, unknown>);
}

function errorsByField(data: Record<string, unknown>): FieldErrors {
    const errors: FieldErrors = {};
    for (const [field, value] of Object.entries(data)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            Object.assign(errors, errorsByField(value as Record<string, unknown>));
            continue;
        }
        const key = field === "non_field_errors" || field === "detail" ? "general" : field;
        errors[key] = (Array.isArray(value) ? value : [value]).map(String);
    }
    return errors;
}

export async function register(data: RegistrationData) {
    return api.post("/api/user/register/", data);
}

export async function getPendingAccounts(signal: AbortSignal): Promise<PendingAccountType[]> {
    return getRequest("/api/accounts/pending/", signal);
}

export async function getGroups(signal: AbortSignal): Promise<GroupType[]> {
    return getRequest("/api/accounts/groups/", signal);
}

export async function approveAccount(pk: number, data: ApprovalData) {
    return api.post(`/api/accounts/pending/${pk}/approve/`, data);
}

export async function deleteAccount(pk: number) {
    return api.delete(`/api/accounts/pending/${pk}/`);
}

export async function confirmEmail(token: string) {
    return api.post("/api/accounts/confirm-email/", { token });
}

export async function sendConfirmation() {
    return api.post("/api/accounts/confirm-email/send/");
}

export async function updateUser(pk: number, data: object) {
    return api.patch(`/api/user/${pk}/`, data);
}
