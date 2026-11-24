import { Alert, Button, Modal } from "react-bootstrap";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { extractDay, extractTime } from "../../../lib/helper";
import { useReceivedInvitationQuery } from "../hooks/useUserQueries";
import { ReceivedInvitationType } from "../utils/User";

function InvitationContent({ invitation }: { invitation: ReceivedInvitationType }) {
    return (
        <>
            <p className="text-body-secondary small mb-3">
                Sent on {extractDay(invitation.sent)} {extractTime(invitation.sent)}
                {invitation.sender && <> by {invitation.sender}</>}
            </p>
            {invitation.is_update && (
                <Alert variant="info" className="py-2">
                    This is an update of the invitation sent before. Only this invitation is valid.
                </Alert>
            )}
            {invitation.message && <p style={{ whiteSpace: "pre-line" }}>{invitation.message}</p>}
            <h3 className="h6 mb-1">{invitation.event_name}</h3>
            <dl className="row small mb-3">
                <dt className="col-3 fw-normal text-body-secondary">Date</dt>
                <dd className="col-9 mb-1">
                    {extractDay(invitation.start)}, {extractTime(invitation.start)}–{extractTime(invitation.end)}
                </dd>
                <dt className="col-3 fw-normal text-body-secondary">Location</dt>
                <dd className="col-9 mb-1">{invitation.location}, {invitation.address}</dd>
                {invitation.info && (
                    <>
                        <dt className="col-3" />
                        <dd className="col-9 mb-1">{invitation.info}</dd>
                    </>
                )}
            </dl>
            <h3 className="h6 mb-1">Invited referees ({invitation.referees.length})</h3>
            <ul className="mb-0" aria-label="Invited referees">
                {invitation.referees.map((r) => (
                    <li key={r.name}>{r.head ? <><strong>{r.name}</strong> (head referee)</> : r.name}</li>
                ))}
            </ul>
        </>
    );
}

type Props = { application: number; show: boolean; onHide: () => void };

/** The invitation sent last for one of the user's applications, read only. */
function InvitationModal({ application, show, onHide }: Props) {
    const query = useReceivedInvitationQuery(application, show);
    return (
        <Modal show={show} onHide={onHide} size="lg" scrollable aria-labelledby={`invitation-title-${application}`}>
            <Modal.Header closeButton>
                <Modal.Title id={`invitation-title-${application}`}>
                    {query.data?.subject ?? "Invitation"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {query.isLoading && <LoadingIndicator />}
                {query.isError && <Alert variant="warning">The invitation could not be loaded.</Alert>}
                {query.data && <InvitationContent invitation={query.data} />}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
}

export default InvitationModal;
