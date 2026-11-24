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
                <div className="d-flex align-items-start gap-2">
                    {app.has_invitation && <ShowInvitation application={app.id} />}
                    <OverlayTrigger placement="left" delay={{ show: 250, hide: 500 }} overlay={renderTooltip(app.status)}><i className="bi bi-info-circle" aria-label={applicationStatusInfo(app.status)}></i></OverlayTrigger>
                </div>
            </CardHeader>
            <CardBody>
                <CardText>{<LocationAddress location={competitionQuery.data.event.location}>&nbsp;&ndash;&nbsp;</LocationAddress>}</CardText>
                <CardText>{competitionQuery.data.info}</CardText>
            </CardBody>
        </Card>
    </>
    return <></>
}

/** An eye button opening the invitation the user received. */
function ShowInvitation({ application }: { application: number }) {
    const [show, setShow] = useState(false);
    return (
        <>
            <Button
                variant="link"
                className="p-0 lh-1 text-reset"
                aria-label="Show the invitation"
                title="Show the invitation"
                onClick={() => setShow(true)}
            >
                <i className="bi bi-eye" aria-hidden="true" />
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
