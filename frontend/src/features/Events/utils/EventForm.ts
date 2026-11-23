import { getRequest } from "../../../lib/api";
import { CompetitionType } from "../../../lib/types";

export type CompetitionDayForm = {
    /** Id of a saved competition day, null for a new one. */
    id: number | null;
    key: number;
    date: string;
    startTime: string;
    endTime: string;
    category: number[];
    invitor: string;
    headReferee: string;
    minimumLevel: string;
    desiredLevel: string;
    competitionFields: string;
    referees: string;
    observers: string;
    application: boolean;
    applicationOpen: string;
    applicationClose: string;
    info: string;
};

export type NewLocationForm = {
    name: string;
    description: string;
    street: string;
    houseNumber: string;
    areaCode: string;
    city: string;
    country: string;
};

export type EventForm = {
    name: string;
    info: string;
    locationMode: "existing" | "new";
    location: string;
    newLocation: NewLocationForm;
    competitions: CompetitionDayForm[];
};

/** Field name -> messages. */
export type FieldErrors = Record<string, string[]>;

export type EventFormErrors = {
    general: string[];
    event: FieldErrors;
    newLocation: FieldErrors;
    competitions: Record<number, FieldErrors>;
};

export type CategoryType = { id: number; name: string; parent: number | null };
export type RefereeOptionType = { id: number; name: string };

let nextKey = 1;

export function emptyCompetitionDay(): CompetitionDayForm {
    return {
        key: nextKey++,
        id: null,
        date: "",
        startTime: "09:00",
        endTime: "17:00",
        category: [],
        invitor: "",
        headReferee: "",
        minimumLevel: "",
        desiredLevel: "",
        competitionFields: "",
        referees: "",
        observers: "",
        application: true,
        applicationOpen: "",
        applicationClose: "",
        info: "",
    };
}

export function emptyEventForm(): EventForm {
    return {
        name: "",
        info: "",
        locationMode: "existing",
        location: "",
        newLocation: {
            name: "",
            description: "",
            street: "",
            houseNumber: "",
            areaCode: "",
            city: "",
            country: "Switzerland",
        },
        competitions: [emptyCompetitionDay()],
    };
}

/** An event as loaded from /api/events/{id}/edit/. */
export type EditableEventType = {
    id: number;
    name: string;
    info: string;
    location: number;
    competitions: CompetitionType[];
};

/** Minutes of a Django duration such as "09:30:00" or "1 02:00:00". */
function durationMinutes(value: string): number {
    const [days, time] = value.includes(" ") ? value.split(" ") : ["0", value];
    const [hours, mins] = time.split(":").map(Number);
    return Number(days) * 24 * 60 + hours * 60 + mins;
}

function addMinutes(time: string, add: number): string {
    // Times are within one day; longer competitions end at midnight.
    const total = Math.min(minutes(time) + add, 23 * 60 + 59);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * The local "YYYY-MM-DDTHH:MM" part of a date time from the server, which
 * sends it in the local time zone of the competitions.
 */
function localDateTime(value: string | null): string {
    return value ? value.slice(0, 16) : "";
}

function optionalId(value: number | null): string {
    return value === null ? "" : String(value);
}

/** The edit form for an event loaded from the server. */
export function eventToForm(event: EditableEventType): EventForm {
    return {
        ...emptyEventForm(),
        name: event.name,
        info: event.info,
        locationMode: "existing",
        location: String(event.location),
        competitions: event.competitions.map((competition) => {
            const startTime = competition.start.slice(11, 16);
            return {
                ...emptyCompetitionDay(),
                id: competition.id,
                date: competition.start.slice(0, 10),
                startTime,
                endTime: addMinutes(startTime, durationMinutes(competition.duration)),
                category: [...competition.category],
                invitor: String(competition.invitor),
                headReferee: optionalId(competition.head_referee),
                minimumLevel: optionalId(competition.minimum_level),
                desiredLevel: String(competition.desired_level),
                competitionFields: optionalId(competition.competition_fields),
                referees: optionalId(competition.referees),
                observers: optionalId(competition.observers),
                application: competition.application,
                applicationOpen: localDateTime(competition.application_open),
                applicationClose: localDateTime(competition.application_close),
                info: competition.info,
            };
        }),
    };
}

export function emptyErrors(): EventFormErrors {
    return { general: [], event: {}, newLocation: {}, competitions: {} };
}

/** Shift a "YYYY-MM-DD" date by a number of days. */
export function addDays(date: string, days: number): string {
    if (!date) return "";
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

/**
 * A copy of a competition day for the following day: same settings,
 * including the registration period, which is usually shared by all days of
 * an event.
 */
export function nextCompetitionDay(day: CompetitionDayForm): CompetitionDayForm {
    return {
        ...day,
        key: nextKey++,
        id: null,
        category: [...day.category],
        date: addDays(day.date, 1),
    };
}

/** The current local time as a "YYYY-MM-DDTHH:MM" value. */
export function nowLocal(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Categories in tree order, sub-categories indented below their parent. */
export function categoryOptions(categories: CategoryType[]) {
    const result: { value: number; label: string; level: number }[] = [];
    const ids = new Set(categories.map((c) => c.id));
    const visit = (parent: number | null, level: number) => {
        categories
            .filter((c) => (parent === null ? c.parent === null || !ids.has(c.parent) : c.parent === parent))
            .forEach((c) => {
                result.push({ value: c.id, label: c.name, level });
                visit(c.id, level + 1);
            });
    };
    visit(null, 0);
    return result;
}

function minutes(time: string): number {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
}

/** Duration between two "HH:MM" times as "HH:MM:00", or null if not positive. */
export function duration(startTime: string, endTime: string): string | null {
    if (!startTime || !endTime) return null;
    const total = minutes(endTime) - minutes(startTime);
    if (total <= 0) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`;
}

function optionalNumber(value: string): number | null {
    return value === "" ? null : Number(value);
}

function optionalString(value: string): string | null {
    return value === "" ? null : value;
}

/** Checks that can be done before asking the server. */
export function validateEventForm(form: EventForm): EventFormErrors {
    const errors = emptyErrors();
    const required = "This field is required.";
    if (!form.name.trim()) errors.event.name = [required];
    if (form.locationMode === "existing") {
        if (!form.location) errors.event.location = ["Choose a location."];
    } else {
        for (const field of ["name", "street", "city"] as const) {
            if (!form.newLocation[field].trim()) errors.newLocation[field] = [required];
        }
    }
    if (form.competitions.length === 0) {
        errors.general.push("Add at least one competition day.");
    }
    form.competitions.forEach((day, index) => {
        const dayErrors: FieldErrors = {};
        if (!day.date) dayErrors.date = [required];
        if (duration(day.startTime, day.endTime) === null) {
            dayErrors.endTime = ["The end must be after the start."];
        }
        if (day.category.length === 0) dayErrors.category = ["Choose at least one category."];
        if (!day.invitor) dayErrors.invitor = [required];
        if (!day.desiredLevel) dayErrors.desiredLevel = [required];
        if (day.applicationOpen && day.applicationClose && day.applicationOpen > day.applicationClose) {
            dayErrors.applicationClose = ["Registration must close after it opens."];
        }
        if (day.applicationClose && day.date && day.applicationClose > `${day.date}T${day.startTime}`) {
            dayErrors.applicationClose = ["Registration must close before the start."];
        }
        if (Object.keys(dayErrors).length > 0) errors.competitions[index] = dayErrors;
    });
    return errors;
}

export function hasErrors(errors: EventFormErrors): boolean {
    return (
        errors.general.length > 0 ||
        Object.keys(errors.event).length > 0 ||
        Object.keys(errors.newLocation).length > 0 ||
        Object.keys(errors.competitions).length > 0
    );
}

export function buildEventPayload(form: EventForm) {
    const location =
        form.locationMode === "existing"
            ? { location: Number(form.location) }
            : {
                new_location: {
                    name: form.newLocation.name.trim(),
                    description: form.newLocation.description,
                    address: {
                        street: form.newLocation.street.trim(),
                        house_number: form.newLocation.houseNumber.trim(),
                        area_code: form.newLocation.areaCode.trim(),
                        city: form.newLocation.city.trim(),
                        country: form.newLocation.country.trim(),
                    },
                },
            };
    return {
        name: form.name.trim(),
        info: form.info,
        ...location,
        competitions: form.competitions.map((day) => ({
            id: day.id,
            start: `${day.date}T${day.startTime}`,
            duration: duration(day.startTime, day.endTime),
            category: day.category,
            invitor: Number(day.invitor),
            head_referee: optionalNumber(day.headReferee),
            minimum_level: optionalNumber(day.minimumLevel),
            desired_level: Number(day.desiredLevel),
            competition_fields: optionalNumber(day.competitionFields),
            referees: optionalNumber(day.referees),
            observers: optionalNumber(day.observers),
            application: day.application,
            application_open: day.application ? optionalString(day.applicationOpen) : null,
            application_close: day.application ? optionalString(day.applicationClose) : null,
            info: day.info,
        })),
    };
}

const competitionFieldNames: Record<string, string> = {
    start: "date",
    duration: "endTime",
    category: "category",
    invitor: "invitor",
    head_referee: "headReferee",
    minimum_level: "minimumLevel",
    desired_level: "desiredLevel",
    competition_fields: "competitionFields",
    referees: "referees",
    observers: "observers",
    application_open: "applicationOpen",
    application_close: "applicationClose",
    info: "info",
};

const locationFieldNames: Record<string, string> = {
    name: "name",
    description: "description",
    street: "street",
    house_number: "houseNumber",
    area_code: "areaCode",
    city: "city",
    country: "country",
};

function messages(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return [value];
    return [];
}

function mapFields(data: Record<string, unknown>, names: Record<string, string>, unknown: string[]): FieldErrors {
    const result: FieldErrors = {};
    for (const [field, value] of Object.entries(data)) {
        const name = names[field];
        if (name) {
            result[name] = messages(value);
        } else {
            unknown.push(...messages(value));
        }
    }
    return result;
}

/**
 * Turn a DRF error response into errors per form field. Nested list errors
 * come either as a list or as an object keyed by the index of the failing
 * entry.
 */
export function parseServerErrors(data: unknown): EventFormErrors {
    const errors = emptyErrors();
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        errors.general.push("The event could not be saved.");
        return errors;
    }
    for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
        if (field === "name" || field === "info" || field === "location") {
            errors.event[field] = messages(value);
        } else if (field === "new_location" && value && typeof value === "object" && !Array.isArray(value)) {
            const { address, ...rest } = value as Record<string, unknown>;
            errors.newLocation = mapFields(rest, locationFieldNames, errors.general);
            if (address && typeof address === "object" && !Array.isArray(address)) {
                Object.assign(
                    errors.newLocation,
                    mapFields(address as Record<string, unknown>, locationFieldNames, errors.general),
                );
            }
        } else if (field === "competitions" && value && typeof value === "object") {
            const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
            if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
                errors.general.push(...messages(value));
                continue;
            }
            for (const [index, dayErrors] of entries) {
                if (dayErrors && typeof dayErrors === "object" && !Array.isArray(dayErrors)) {
                    const mapped = mapFields(dayErrors as Record<string, unknown>, competitionFieldNames, errors.general);
                    if (Object.keys(mapped).length > 0) errors.competitions[Number(index)] = mapped;
                }
            }
        } else {
            errors.general.push(...messages(value));
        }
    }
    return errors;
}

export async function getLocations(signal: AbortSignal) {
    return getRequest("/api/locations/", signal);
}

export async function getCategories(signal: AbortSignal) {
    return getRequest("/api/categories/", signal);
}

export async function getReferees(signal: AbortSignal) {
    return getRequest("/api/referees/", signal);
}

export async function getEditableEvent(pk: number, signal: AbortSignal): Promise<EditableEventType> {
    return getRequest(`/api/events/${pk}/edit/`, signal);
}

/** An application as seen by the admins of an event. */
export type EventApplicationType = {
    id: number;
    user: number;
    name: string;
    competition: number;
    status: number;
    status_display: string;
    created: string;
};

export async function getEventApplications(pk: number, signal: AbortSignal): Promise<EventApplicationType[]> {
    return getRequest(`/api/events/${pk}/applications/`, signal);
}
