import { Alert } from "react-bootstrap";
import LoadingIndicator from "../components/LoadingIndicator";
import EventForm from "../features/Events/components/EventForm";
import { useHasPermission } from "../features/User/hooks/useUserQueries";

function EventCreate() {
    const allowed = useHasPermission("competition.add_event");
    if (allowed === undefined) return <LoadingIndicator size="15rem" />;
    if (!allowed) {
        return (
            <Alert variant="warning" className="mt-4">
                You don't have the permission to create events. Ask an admin of
                your category for access.
            </Alert>
        );
    }
    return <EventForm />;
}

export default EventCreate;
