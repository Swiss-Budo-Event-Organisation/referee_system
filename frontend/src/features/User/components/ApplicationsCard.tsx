import { ReactElement, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardText, CardTitle, Form, InputGroup, Nav, OverlayTrigger, Tooltip } from "react-bootstrap";
import { ApplicationType, CompetitionOverviewType } from "../../../lib/types";
import { extractTime, formattedDateRange } from "../../../lib/helper";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { LocationAddress } from "../../../components/Location";
import { applicationStatusClass, applicationStatusInfo } from "../../Events/utils/Application";
import { useApplicationQuery } from "../hooks/useUserQueries";
import { APPLICATION_TABS, ApplicationTab, filterApplications } from "../utils/Applications";
import { HistoricSearchType } from "../utils/User";
import HistoricSearchForm from "./HistoricSearchForm";
import InvitationModal from "./InvitationModal";

const EMPTY: Record<ApplicationTab, string> = {
    upcoming: "You have not applied for any upcoming competition.",
    invited: "You have not been invited to any upcoming competition.",
    past: "You have not been invited to any past competition.",
    all: "You have not applied for any competition yet.",
};

/** The messages of a refused search, e.g. {"start_after": ["Enter a date…"]}. */
function errorMessages(error: unknown): string {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data && typeof data === "object") {
        return Object.values(data as Record<string, unknown>).flat().join(" ");
    }
    return "The search failed. Please try again.";
}

function ApplicationsList({ user }: { user: number }) {
    const applicationQuery = useApplicationQuery(user)
    const [tab, setTab] = useState<ApplicationTab>("upcoming");
    const [search, setSearch] = useState("");
    // Searched on the server, in the All tab only.
    const [historic, setHistoric] = useState<HistoricSearchType | null>(null);
    const historicQuery = useApplicationQuery(user, historic);
    const searching = tab === "all" && historic !== null;
    const source = searching ? historicQuery : applicationQuery;
    // The loaded applications are filtered here, without asking the server again.
    const pages = source.data?.pages;
    const loaded = useMemo(() => pages?.flatMap((page) => page.results) ?? [], [pages]);
    const shown = useMemo(() => filterApplications(loaded, tab, search), [loaded, tab, search]);
    if (applicationQuery.isLoading) return <LoadingIndicator />
    if (applicationQuery.data == null) return <></>
    const term = search.trim();
    const total = pages?.[0]?.count ?? 0;
    return <>
        <h2 className="mt-5">Applications</h2>
        <InputGroup className="mb-3">
            <InputGroup.Text><i className="bi bi-search" aria-hidden="true" /></InputGroup.Text>
            <Form.Control
                type="search"
                placeholder="Search by event, location or date…"
                aria-label="Search applications"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            {search && <Button variant="outline-secondary" onClick={() => setSearch("")}>Clear</Button>}
        </InputGroup>
        <Nav variant="tabs" activeKey={tab} onSelect={(key) => key && setTab(key as ApplicationTab)} className="mb-3">
            {APPLICATION_TABS.map(({ key, title }) => (
                <Nav.Item key={key}>
                    <Nav.Link eventKey={key}>{title}</Nav.Link>
                </Nav.Item>
            ))}
        </Nav>
        {tab === "all" && <HistoricSearchForm onSearch={setHistoric} active={historic} />}
        {searching && historicQuery.isLoading && <LoadingIndicator />}
        {searching && historicQuery.isError && (
            <Alert variant="danger">{errorMessages(historicQuery.error)}</Alert>
        )}
        {searching && historicQuery.isSuccess && (
            <p className="small text-body-secondary" role="status">
                {total === 0
                    ? "No application matches the historic search."
                    : `${total} application${total === 1 ? "" : "s"} found by the historic search.`}
            </p>
        )}
        {source.isSuccess && (shown.length === 0
            ? (searching && total === 0 ? null : <p className="text-body-secondary" role="status">
                {term ? `No application matching “${term}”.` : EMPTY[tab]}
            </p>)
            : shown.map((elem) => <Application key={elem.id} app={elem} />))}
        {source.hasNextPage && (
            <div className="d-flex flex-column align-items-center gap-1 mt-3">
                <span className="small text-body-secondary">
                    {loaded.length} of {total} applications loaded, the latest first.
                </span>
                <Button variant="outline-primary" onClick={() => source.fetchNextPage()}
                    disabled={source.isFetchingNextPage}>
                    {source.isFetchingNextPage ? "Loading…" : "Load older applications"}
                </Button>
            </div>
        )}
    </>
}

function Application({ app }: { app: ApplicationType }) {
    const competition: CompetitionOverviewType | undefined = app.competition_overview
    if (competition == null) return <></>
    return <>
        <Card className={applicationStatusClass(app.status)}>
            <CardHeader className={"d-flex justify-content-between"}>
                <CardTitle>{competition.event.name} &ndash; {formattedDateRange(competition.start)} &ndash; {extractTime(competition.start)}</CardTitle>
                <div>
                    <OverlayTrigger placement="left" delay={{ show: 250, hide: 500 }} overlay={renderTooltip(app.status)}><i className="bi bi-info-circle" aria-label={applicationStatusInfo(app.status)}></i></OverlayTrigger>
                </div>
            </CardHeader>
            {/* The button sits next to the text if there is room, else below it, on the right. */}
            <CardBody className="d-flex flex-wrap align-items-center column-gap-3 row-gap-2">
                <div className="me-auto">
                    <CardText className={competition.info ? undefined : "mb-0"}>
                        {<LocationAddress location={competition.event.location}>&nbsp;&ndash;&nbsp;</LocationAddress>}
                    </CardText>
                    {competition.info && <CardText className="mb-0">{competition.info}</CardText>}
                </div>
                {app.has_invitation && (
                    <div className="ms-auto">
                        <ShowInvitation application={app.id} />
                    </div>
                )}
            </CardBody>
        </Card>
    </>
}

/** A button opening the invitation the user received. */
function ShowInvitation({ application }: { application: number }) {
    const [show, setShow] = useState(false);
    return (
        <>
            <Button variant="outline-primary" onClick={() => setShow(true)}>
                <i className="bi bi-eye me-1" aria-hidden="true" /> Show the invitation
            </Button>
            <InvitationModal application={application} show={show} onHide={() => setShow(false)} />
        </>
    );
}

function renderTooltip(code: number) {
    return function (props: object): ReactElement {
        return <Tooltip {...props}>
            {applicationStatusInfo(code)}
        </Tooltip>;
    }
}

export default ApplicationsList
