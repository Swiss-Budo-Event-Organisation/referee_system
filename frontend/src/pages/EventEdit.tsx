import { Alert } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import LoadingIndicator from "../components/LoadingIndicator";
import EventApplications from "../features/Events/components/EventApplications";
import EventForm from "../features/Events/components/EventForm";
import { useEditableEventQuery } from "../features/Events/hooks/useEventFormQueries";
import NotFound from "./NotFound";

function EventEditor({ pk }: { pk: number }) {
    const query = useEditableEventQuery(pk);
    if (query.isLoading) return <LoadingIndicator size="15rem" />;
    if (query.isError || !query.data) {
        const status = isAxiosError(query.error) ? query.error.response?.status : undefined;
        if (status === 404) return <NotFound />;
        return (
            <Alert variant="warning" className="mt-4">
                {status === 403
                    ? "You don't have the permission to edit this event."
                    : "The event could not be loaded. Please reload the page."}
            </Alert>
        );
    }
    return (
        <>
            <EventForm event={query.data} />
            <h2 className="h4 mb-3">Applications</h2>
            <EventApplications eventId={pk} competitions={query.data.competitions} />
        </>
    );
}

function EventEdit() {
    const { pk } = useParams();
    const id = Number(pk);
    if (!pk || !Number.isInteger(id)) return <NotFound />;
    // A new key resets the form when switching to another event.
    return <EventEditor key={id} pk={id} />;
}

export default EventEdit;
