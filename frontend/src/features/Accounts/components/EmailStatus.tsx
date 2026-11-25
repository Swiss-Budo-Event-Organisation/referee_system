import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "react-bootstrap";
import { toast } from "react-toastify";
import { fieldErrors, sendConfirmation } from "../utils/Accounts";

/** The user's e-mail address, whether it is confirmed, and a way to confirm it. */
function EmailStatus({ email, confirmed }: { email: string; confirmed: boolean }) {
    const mutation = useMutation({
        mutationFn: sendConfirmation,
        onSuccess: (res) => toast.success(res.data?.detail ?? "We sent you a link."),
        onError: (error) => Object.values(fieldErrors(error)).flat().forEach((m) => toast.error(m)),
    });
    return (
        <Card>
            <CardHeader><CardTitle>E-mail address</CardTitle></CardHeader>
            <CardBody className="d-flex flex-wrap align-items-center column-gap-3 row-gap-2">
                <span className="me-auto">
                    {email || <span className="text-body-secondary">None</span>}{" "}
                    {email && (confirmed
                        ? <Badge bg="success">Confirmed</Badge>
                        : <Badge bg="warning" text="dark">Not confirmed</Badge>)}
                </span>
                {email && !confirmed && (
                    <Button variant="outline-primary" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                        <i className="bi bi-envelope me-1" aria-hidden="true" /> Send confirmation link
                    </Button>
                )}
            </CardBody>
        </Card>
    );
}

export default EmailStatus;
