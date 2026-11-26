/** The statuses of Application.Status in the backend, furthest along first. */
export const APPLICATION_STATUSES: { value: number; label: string }[] = [
    { value: 3, label: "Participated" },
    { value: 2, label: "Invited" },
    { value: 1, label: "Selected" },
    { value: 0, label: "Applied" },
    { value: -1, label: "Not selected" },
    { value: -2, label: "Cancelled" },
    { value: -3, label: "Declined" },
    { value: -4, label: "No Show" },
];

export function applicationStatusClass(status: number) {
    switch (status) {
        case -4: // No Show
            return "no-show"
        case -3: // Declined
            return "declined"
        case -2: // Cancelled
            return "cancelled"
        case -1: // Not selected
            return "not-selected"
        case 0: // Applied
            return "applied"
        case 1: // Selected
            return "selected"
        case 2: // Invited
            return "invited"
        case 3: // Participated
            return "participated"
        default:
            return ""
    }
}
export function applicationStatusInfo(status: number) {
    switch (status) {
        case -4: // No Show
            return "The applied was invited but did not show up at the event."
        case -3: // Declined
            return "The invitation has been sent without considering this application."
        case -2: // Cancelled
            return "The application was withdrawn."
        case -1: // Not selected
            return "This application is not considered in the invitation. This is however not yet confirmed."
        case 0: // Applied
            return "The application is active."
        case 1: // Selected
            return "This application is considered for the invitation. This is however not yet confirmed."
        case 2: // Invited
            return "The invitation has been sent and this application is considered."
        case 3: // Participated
            return "The applied has taken part in the event."
        default:
            return ""
    }
}
