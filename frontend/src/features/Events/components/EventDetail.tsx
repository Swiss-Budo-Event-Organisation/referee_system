import { ReactNode, } from "react"
import { Container, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import { LocationAddress } from "../../../components/Location";
import CompetitionDetail from "./CompetitionDetail";
import { CompetitionType } from "../../../lib/types";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useEventQuery } from "../hooks/useEventsQueries";

function Structure({ count, children }: { count: number, children: ReactNode }) {
    if (count < 2) {
        return children
    }
    return (
        <Container className="px-0 mt-2">
            <Row xs={1} lg={2} className="g-2">
                {children}
            </Row>
        </Container>
    )
}

function EventDetailRender({ pk }: { pk: number }) {
    const eventQuery = useEventQuery(pk)

    if (eventQuery.isLoading) return <LoadingIndicator size="15rem" />;
    return (
        <>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <h1>{eventQuery.data.name}</h1>
                <div className="d-flex gap-2">
                    {eventQuery.data.can_view_details && (
                        <Link to={`/events/${pk}/details`} className="btn btn-outline-secondary">
                            <i className="bi bi-list-check" aria-hidden="true" /> View details
                        </Link>
                    )}
                    {eventQuery.data.can_edit && (
                        <Link to={`/events/${pk}/edit`} className="btn btn-outline-primary">
                            <i className="bi bi-pencil" aria-hidden="true" /> Edit
                        </Link>
                    )}
                </div>
            </div>
            <LocationAddress location={eventQuery.data.location}>
                &nbsp;&ndash;&nbsp;
            </LocationAddress>
            <Structure count={eventQuery.data.competitions?.length ?? 0}>
                {eventQuery.data.competitions?.map((elem: CompetitionType) => {
                    return <CompetitionDetail competition={elem} key={elem.id} />
                })}
            </Structure>
        </>
    )
}

export default EventDetailRender
