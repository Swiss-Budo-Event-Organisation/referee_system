import { useMutation } from "@tanstack/react-query";
import { Badge, Button } from "react-bootstrap";
import { toast } from "react-toastify";
import { fieldErrors, sendConfirmation } from "../utils/Accounts";

/** The user's e-mail address, whether it is confirmed, and a way to confirm it. */
function EmailStatus({ email, confirmed }: { email: string; confirmed: boolean }) {
    const mutation = useMutation({
        mutationFn: sendConfirmation,
        onSuccess: (res) => toast.success(res.data?.detail ?? "We sent you a link."),
        onError: (error) => Object.values(fieldErrors(error)).flat().forEach((m) => toast.error(m)),
    });
    if (!email) return <span className="text-body-secondary">Not given</span>;
    return (
        <span className="d-inline-flex flex-wrap align-items-center column-gap-2 row-gap-1">
            {email}
            {confirmed
                ? <Badge bg="success">Confirmed</Badge>
                : <Badge bg="warning" text="dark">Not confirmed</Badge>}
            {!confirmed && (
                <Button variant="outline-primary" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                    <i className="bi bi-envelope me-1" aria-hidden="true" /> Send confirmation link
                </Button>
            )}
        </span>
    );
}

export default EmailStatus;
