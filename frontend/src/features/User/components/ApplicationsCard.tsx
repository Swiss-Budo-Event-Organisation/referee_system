import { ReactElement, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardText, CardTitle, OverlayTrigger, Tooltip } from "react-bootstrap";
import { ApplicationType } from "../../../lib/types";
import { extractTime, formattedDateRange } from "../../../lib/helper";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { LocationAddress } from "../../../components/Location";
import { applicationStatusClass, applicationStatusInfo } from "../../Events/utils/Application";
import { useCompetitionQuery } from "../../Events/hooks/useCompetitionQueries";
import { useApplicationQuery } from "../hooks/useUserQueries";
import InvitationModal from "./InvitationModal";

function ApplicationsList({ user }: { user: number }) {
    const applicationQuery = useApplicationQuery(user)
    if (applicationQuery.isLoading) return <LoadingIndicator />
    if (applicationQuery.data == null) return <></>
    return <>
        <h2 className="mt-5">Applications</h2>
        {applicationQuery.data.map((elem: ApplicationType) => {
            return <Application key={elem.id} app={elem} />
        }
        )
        }
    </>
}

function Application({ app }: { app: ApplicationType }) {
    const competitionQuery = useCompetitionQuery(app.competition)
    if (competitionQuery.isLoading) return <LoadingIndicator />
    if (competitionQuery.data != null) return <>
        <Card className={applicationStatusClass(app.status)}>
            <CardHeader className={"d-flex justify-content-between"}>
                <CardTitle>{competitionQuery.data.event.name} &ndash; {formattedDateRange(competitionQuery.data.start)} &ndash; {extractTime(competitionQuery.data.start)}</CardTitle>
                <div>
                    <OverlayTrigger placement="left" delay={{ show: 250, hide: 500 }} overlay={renderTooltip(app.status)}><i className="bi bi-info-circle" aria-label={applicationStatusInfo(app.status)}></i></OverlayTrigger>
                </div>
            </CardHeader>
            {/* The button sits next to the text if there is room, else below it, on the right. */}
            <CardBody className="d-flex flex-wrap align-items-center column-gap-3 row-gap-2">
                <div className="me-auto">
                    <CardText className={competitionQuery.data.info ? undefined : "mb-0"}>
                        {<LocationAddress location={competitionQuery.data.event.location}>&nbsp;&ndash;&nbsp;</LocationAddress>}
                    </CardText>
                    {competitionQuery.data.info && <CardText className="mb-0">{competitionQuery.data.info}</CardText>}
                </div>
                {app.has_invitation && (
                    <div className="ms-auto">
                        <ShowInvitation application={app.id} />
                    </div>
                )}
            </CardBody>
        </Card>
    </>
    return <></>
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
