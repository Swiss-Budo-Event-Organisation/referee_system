import { useParams } from "react-router-dom";
import EventDetailsView from "../features/Events/components/EventDetailsView";
import NotFound from "./NotFound";

/** All details of an event with its applications, for observers and admins. */
function EventDetails() {
    const { pk } = useParams();
    const id = Number(pk);
    if (!pk || !Number.isInteger(id)) return <NotFound />;
    return <EventDetailsView pk={id} />;
}

export default EventDetails;
