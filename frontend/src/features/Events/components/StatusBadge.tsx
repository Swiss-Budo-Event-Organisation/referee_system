import { Badge } from "react-bootstrap";

/** Colours for Application.Status in the backend, furthest along first. */
const STATUS_VARIANTS: Record<number, string> = {
    3: "success",   // Participated
    2: "primary",   // Invited
    1: "info",      // Selected
    0: "secondary", // Applied
    [-1]: "light",  // Not selected
    [-2]: "warning", // Cancelled
    [-3]: "warning", // Declined
    [-4]: "danger", // No show
};

/** The status of an application as a coloured badge. */
function StatusBadge({ status, label }: { status: number; label: string }) {
    const variant = STATUS_VARIANTS[status] ?? "secondary";
    return (
        <Badge bg={variant} text={["light", "warning", "info"].includes(variant) ? "dark" : undefined}>
            {label}
        </Badge>
    );
}

export default StatusBadge;
