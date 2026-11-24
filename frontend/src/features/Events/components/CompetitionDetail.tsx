import { Button, Card, Col, ListGroup, ListGroupItem } from "react-bootstrap";
import { Link } from "react-router-dom";
import { type CompetitionType } from "../../../lib/types"
import { extractDay, license } from "../../../lib/helper";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useLicenseQuery } from "../../../hooks/useQueries";
import { handleApply, registrationClosedReason } from "../utils/Competition";
import ListGroupItemIfLargerNumber from "./ListGroupItem";

function CompetitionDetail({ competition }: { competition: CompetitionType }) {
    const licenseQuery = useLicenseQuery()
    const closedReason = registrationClosedReason(competition)
    return (
        <>
            <Col>
                <Card>
                    <Card.Header>
                        {extractDay(competition.start)}
                    </Card.Header>
                    <Card.Body>
                        <Card.Title>

                        </Card.Title>
                        <Card.Text>
                            {competition.info}
                        </Card.Text>
                        <ListGroup variant="flush">
                            <ListGroupItemIfLargerNumber variable={competition.competition_fields}>Mats: {competition.competition_fields}</ListGroupItemIfLargerNumber>
                            <ListGroupItemIfLargerNumber variable={competition.referees}>Referees: {competition.referees}</ListGroupItemIfLargerNumber>
                            <ListGroupItemIfLargerNumber variable={competition.observers}>
                                Observers: {competition.observers}
                            </ListGroupItemIfLargerNumber>
                            {(licenseQuery.isLoading) ?
                                <LoadingIndicator /> :
                                <ListGroupItem>
                                    License: {license(competition.desired_level, licenseQuery.data)}
                                    {competition.minimum_level === null ?
                                        " (no license required)" :
                                        competition.desired_level != competition.minimum_level && ` (minimum: ${license(competition.minimum_level, licenseQuery.data)})`}
                                </ListGroupItem>
                            }
                        </ListGroup>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                            {closedReason ?
                                <p className="text-body-secondary mb-0 me-auto">{closedReason}</p> :
                                <Button onClick={handleApply(competition.id)}>Apply</Button>
                            }
                            {competition.can_invite && (
                                <Link to={`/competitions/${competition.id}/invitation`} className="btn btn-outline-primary">
                                    <i className="bi bi-envelope" aria-hidden="true" /> Invitation
                                </Link>
                            )}
                        </div>
                    </Card.Body>
                </Card>
            </Col >
        </>
    )
}

export default CompetitionDetail
