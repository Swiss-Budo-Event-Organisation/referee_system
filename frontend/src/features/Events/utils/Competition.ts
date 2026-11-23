import { MouseEvent } from "react";
import { toast } from "react-toastify";
import api, { getRequest } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { CompetitionType } from "../../../lib/types";
import { formatDate, extractTime } from "../../../lib/helper";

/**
 * Why registration is not open, or null if it is. Mirrors
 * Competition.registration_open in the backend: without an opening date
 * registration is open right away, without a closing date until the start.
 */
export function registrationClosedReason(competition: CompetitionType, now: Date = new Date()): string | null {
    if (!competition.application) return "Registration is not possible.";
    if (competition.application_open && now < new Date(competition.application_open)) {
        const opens = competition.application_open;
        return `Registration opens on ${formatDate(new Date(opens))} at ${extractTime(opens)}.`;
    }
    if (now > new Date(competition.application_close ?? competition.start)) return "Registration is closed.";
    return null;
}

export function handleApply(id: number) {
    return async function handlerFunction(_event: MouseEvent) {
        api.post("/api/applications/", { "competition": id, "user": getUser() })
            .then((res) => {
                if (res.status === 201) {
                    toast.success("Your application was received and registered.");
                }
            })
            .catch((error) => {
                if (error.status === 400) {
                    for (const [_key, value] of Object.entries(error.response?.data)) {
                        toast.error(String(value));
                    }
                } else if (error.status === 403) {
                    toast.error("You are not allowed to apply.");
                } else {
                    console.error(error);
                }
            })
    }
}

export async function getCompetition(id: number, signal: AbortSignal) {
    return getRequest(`/api/competition/${id}`, signal)
}
