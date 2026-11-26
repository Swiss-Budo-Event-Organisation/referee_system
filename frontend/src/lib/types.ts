export type EventType = {
    name: string;
    id: number;
    info: string;
    location: LocationType;
    competitions?: CompetitionType[];
    slug: string;
    creator: number | null;
    created: string;
    modified: string;
    start: string;
    end: string | null;
    can_edit?: boolean;
    can_view_details?: boolean;
}
export type LocationType = {
    id: number;
    name: string;
    description: string;
    address: number;
}
export type AddressType = {
    street: string;
    house_number: string | null;
    area_code: string | null;
    city: string;
    country: string | null;
}
export type CompetitionType = {
    id: number;
    event: number;
    category: number[];
    competition_fields: number | null;
    invitor: number;
    desired_level: number;
    minimum_level: number | null;
    start: string;
    info: string;
    observers: number | null;
    referees: number | null;
    duration: string;
    application: boolean;
    application_open: string | null;
    application_close: string | null;
    head_referee: number | null;
    modified: string;
    /** Whether the user may prepare the invitation (its invitor, staff). */
    can_invite?: boolean;
}
export type LicenseType = {
    id: number;
    name: string;
    parent?: number;
}

export type ApplicationType = {
    id: number;
    user: number;
    created: string;
    modified: string;
    accommodation?: number;
    accommodation_arrival?: string;
    accommodation_departure?: string;
    accommodation_remark?: string;
    competition: number;
    status: number;
    role?: number;
    /** Whether the invitation sent last invites this application. */
    has_invitation?: boolean;
    /** The competition applied for, in the user's own applications. */
    competition_overview?: CompetitionOverviewType;
}

/** A competition with its event, as listed with the user's own applications. */
export type CompetitionOverviewType = {
    id: number;
    start: string;
    info: string;
    event: {
        id: number;
        name: string;
        location: LocationType;
        start: string;
        end: string | null;
    };
}

export type UserType = {
    id?: number;
    firstname?: string;
    lastname?: string;
    isAuthenticated?: boolean;
}

export type ExamType = {
    id: number;
    candidate: number;
    license: number;
    chief_examiner?: number;
    /** ISO date, such as "2024-05-01". */
    date?: string;
    address?: number;
    grade?: number;
    passed: boolean;
    note_external: string;
}

export type ThemeLiteral = "light" | "dark";
