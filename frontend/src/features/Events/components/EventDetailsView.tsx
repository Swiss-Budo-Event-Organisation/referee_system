import { ReactNode, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { LocationAddress } from "../../../components/Location";
import { useLicenseQuery } from "../../../hooks/useQueries";
import { extractDay, extractTime, formattedDateRange, license } from "../../../lib/helper";
import { CompetitionType, EventType, LicenseType } from "../../../lib/types";
import { useCategoriesQuery, useEventApplicationsQuery, useRefereesQuery } from "../hooks/useEventFormQueries";
import { useEventQuery } from "../hooks/useEventsQueries";
import { registrationClosedReason } from "../utils/Competition";
import { CategoryType, durationMinutes, EventApplicationType, RefereeOptionType } from "../utils/EventForm";

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

function StatusBadge({ application }: { application: EventApplicationType }) {
    const variant = STATUS_VARIANTS[application.status] ?? "secondary";
    return (
        <Badge bg={variant} text={["light", "warning", "info"].includes(variant) ? "dark" : undefined}>
            {application.status_display}
        </Badge>
    );
}

/** The part of the name matching the search, highlighted. */
function Highlight({ text, search }: { text: string; search: string }) {
    const start = search ? text.toLowerCase().indexOf(search.toLowerCase()) : -1;
    if (start < 0) return <>{text}</>;
    const end = start + search.length;
    return <>{text.slice(0, start)}<mark className="px-0">{text.slice(start, end)}</mark>{text.slice(end)}</>;
}

function endTime(competition: CompetitionType): string {
    const end = new Date(new Date(competition.start).getTime() + durationMinutes(competition.duration) * 60_000);
    return extractTime(end.toISOString());
}

function registration(competition: CompetitionType): string {
    if (!competition.application) return "Not possible";
    const opens = competition.application_open
        ? `${extractDay(competition.application_open)} ${extractTime(competition.application_open)}`
        : "now";
    const closes = competition.application_close
        ? `${extractDay(competition.application_close)} ${extractTime(competition.application_close)}`
        : "the start";
    return `From ${opens} until ${closes}`;
}

type Lookups = {
    categories: CategoryType[];
    licenses: LicenseType[];
    referees: RefereeOptionType[];
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="col-5 text-body-secondary fw-normal">{label}</dt>
            <dd className="col-7 mb-2">{children}</dd>
        </>
    );
}

type DayProps = {
    competition: CompetitionType;
    applications: EventApplicationType[];
    total: number;
    search: string;
    lookups: Lookups;
};

function CompetitionDay({ competition, applications, total, search, lookups }: DayProps) {
    const referee = (id: number | null) => (id === null ? "–" : lookups.referees.find((r) => r.id === id)?.name ?? "–");
    const categories = competition.category
        .map((id) => lookups.categories.find((c) => c.id === id)?.name)
        .filter(Boolean);
    const open = registrationClosedReason(competition) === null;
    const active = applications.filter((a) => a.status >= 0).length;
    const title = extractDay(competition.start);

    return (
        <Card className="mb-4 shadow-sm" as="section" aria-label={`Details ${title}`}>
            <Card.Header className="d-flex flex-wrap align-items-center gap-2">
                <strong>{title}</strong>
                <span className="text-body-secondary">
                    {extractTime(competition.start)}–{endTime(competition)}
                </span>
                {competition.info && <span>· {competition.info}</span>}
                <span className="ms-auto d-flex gap-1 flex-wrap">
                    {categories.map((name) => (
                        <Badge key={name} bg="body-tertiary" className="border text-body fw-normal">{name}</Badge>
                    ))}
                </span>
            </Card.Header>
            <Card.Body>
                <Row className="g-4">
                    <Col lg={4}>
                        <h3 className="h6 text-uppercase text-body-secondary">Details</h3>
                        <dl className="row mb-0 small">
                            <Detail label="Invited by">{referee(competition.invitor)}</Detail>
                            <Detail label="Head referee">{referee(competition.head_referee)}</Detail>
                            <Detail label="Desired license">{license(competition.desired_level, lookups.licenses)}</Detail>
                            <Detail label="Minimum license">
                                {competition.minimum_level === null
                                    ? "No license required"
                                    : license(competition.minimum_level, lookups.licenses)}
                            </Detail>
                            <Detail label="Mats">{competition.competition_fields ?? "–"}</Detail>
                            <Detail label="Referees needed">{competition.referees ?? "–"}</Detail>
                            <Detail label="Observers needed">{competition.observers ?? "–"}</Detail>
                            <Detail label="Registration">
                                {registration(competition)}{" "}
                                <Badge bg={open ? "success" : "secondary"}>{open ? "open" : "closed"}</Badge>
                            </Detail>
                        </dl>
                    </Col>
                    <Col lg={8}>
                        <div className="d-flex justify-content-between align-items-baseline mb-2">
                            <h3 className="h6 text-uppercase text-body-secondary mb-0">Applications</h3>
                            <span className="small">
                                {search
                                    ? `${applications.length} of ${total} match`
                                    : `${total} in total, ${active} active`}
                            </span>
                        </div>
                        {applications.length === 0 ? (
                            <p className="text-body-secondary mb-0">
                                {search ? `No referee matching “${search}” applied for this day.` : "No applications yet."}
                            </p>
                        ) : (
                            <Table size="sm" hover className="mb-0 align-middle">
                                <thead>
                                    <tr><th>Referee</th><th>Status</th><th className="text-end">Applied on</th></tr>
                                </thead>
                                <tbody>
                                    {applications.map((a) => (
                                        <tr key={a.id}>
                                            <td><Highlight text={a.name} search={search} /></td>
                                            <td><StatusBadge application={a} /></td>
                                            <td className="text-end text-body-secondary">{extractDay(a.created)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        )}
                    </Col>
                </Row>
            </Card.Body>
        </Card>
    );
}

/** Status counts over all days, in the order of the list. */
function StatusSummary({ applications }: { applications: EventApplicationType[] }) {
    const counts = new Map<number, { label: string; count: number; sample: EventApplicationType }>();
    [...applications].sort((a, b) => b.status - a.status).forEach((a) => {
        const entry = counts.get(a.status);
        if (entry) entry.count += 1;
        else counts.set(a.status, { label: a.status_display, count: 1, sample: a });
    });
    if (counts.size === 0) return null;
    return (
        <div className="d-flex flex-wrap gap-2" aria-label="Applications by status">
            {[...counts.values()].map(({ label, count, sample }) => (
                <span key={label} className="d-inline-flex align-items-center gap-1">
                    <StatusBadge application={sample} /> <span className="small">{count}</span>
                </span>
            ))}
        </div>
    );
}

function EventDetailsContent({ event }: { event: EventType }) {
    const [search, setSearch] = useState("");
    const applications = useEventApplicationsQuery(event.id);
    const categories = useCategoriesQuery();
    const licenses = useLicenseQuery();
    const referees = useRefereesQuery();

    const queries = [applications, categories, licenses, referees];
    if (queries.some((q) => q.isLoading)) return <LoadingIndicator size="15rem" />;
    if (queries.some((q) => q.isError)) {
        return <Alert variant="danger">The details could not be loaded. Please reload the page.</Alert>;
    }

    const all = applications.data ?? [];
    const term = search.trim();
    const matches = term ? all.filter((a) => a.name.toLowerCase().includes(term.toLowerCase())) : all;
    const lookups = {
        categories: categories.data as CategoryType[],
        licenses: licenses.data as LicenseType[],
        referees: referees.data as RefereeOptionType[],
    };

    return (
        <>
            <Card className="mb-4 shadow-sm">
                <Card.Body>
                    <Row className="g-3 align-items-center">
                        <Col md={7}>
                            <InputGroup>
                                <InputGroup.Text><i className="bi bi-search" aria-hidden="true" /></InputGroup.Text>
                                <Form.Control
                                    type="search"
                                    placeholder="Search referee by name…"
                                    aria-label="Search referee"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    autoFocus
                                />
                                {search && (
                                    <Button variant="outline-secondary" onClick={() => setSearch("")}>Clear</Button>
                                )}
                            </InputGroup>
                            {term && (
                                <div className="small mt-2" role="status">
                                    {matches.length === 0
                                        ? `No application from a referee matching “${term}”.`
                                        : `${matches.length} application${matches.length === 1 ? "" : "s"} matching “${term}”.`}
                                </div>
                            )}
                        </Col>
                        <Col md={5}>
                            <div className="small text-body-secondary mb-1">{all.length} applications</div>
                            <StatusSummary applications={term ? matches : all} />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {event.competitions?.map((competition) => (
                <CompetitionDay
                    key={competition.id}
                    competition={competition}
                    applications={matches.filter((a) => a.competition === competition.id)}
                    total={all.filter((a) => a.competition === competition.id).length}
                    search={term}
                    lookups={lookups}
                />
            ))}
        </>
    );
}

/** All details of an event with its applications, without editing. */
function EventDetailsView({ pk }: { pk: number }) {
    const eventQuery = useEventQuery(pk);

    if (eventQuery.isLoading) return <LoadingIndicator size="15rem" />;
    if (eventQuery.isError || !eventQuery.data) {
        const status = isAxiosError(eventQuery.error) ? eventQuery.error.response?.status : undefined;
        return (
            <Alert variant="warning" className="mt-4">
                {status === 404 ? "This event does not exist." : "The event could not be loaded."}
            </Alert>
        );
    }
    const event = eventQuery.data as EventType;
    if (!event.can_view_details) {
        return (
            <Alert variant="warning" className="mt-4">
                You don't have the permission to see the details of this event.
            </Alert>
        );
    }

    return (
        <div className="mb-5">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div>
                    <h1 className="mb-1">{event.name}</h1>
                    <div className="text-body-secondary">
                        <i className="bi bi-calendar-event" aria-hidden="true" /> {formattedDateRange(event.start, event.end)}
                        <span className="mx-2">·</span>
                        <i className="bi bi-geo-alt" aria-hidden="true" /> <LocationAddress location={event.location}>, </LocationAddress>
                    </div>
                    {event.info && <p className="mt-2 mb-0">{event.info}</p>}
                </div>
                <div className="d-flex gap-2">
                    <Link to={`/events/${event.id}`} className="btn btn-outline-secondary">
                        <i className="bi bi-arrow-left" aria-hidden="true" /> Back to event
                    </Link>
                    {event.can_edit && (
                        <Link to={`/events/${event.id}/edit`} className="btn btn-outline-primary">
                            <i className="bi bi-pencil" aria-hidden="true" /> Edit
                        </Link>
                    )}
                </div>
            </div>
            <EventDetailsContent event={event} />
        </div>
    );
}

export default EventDetailsView;
