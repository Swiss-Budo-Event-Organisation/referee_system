import { Button, Modal } from "react-bootstrap";
import { formatDate, license } from "../../../lib/helper";
import { AddressType, ExamType } from "../../../lib/types";
import { useAddressQuery, useLicenseQuery } from "../../../hooks/useQueries";
import { useRefereesQuery } from "../../Events/hooks/useEventFormQueries";
import { RefereeOptionType } from "../../Events/utils/EventForm";

function formatAddress(address: AddressType): string {
    const street = [address.street, address.house_number].filter(Boolean).join(" ");
    const city = [address.area_code, address.city].filter(Boolean).join(" ");
    return [street, city, address.country].filter(Boolean).join(", ");
}

function ChiefExaminer({ id, enabled }: { id: number; enabled: boolean }) {
    const query = useRefereesQuery(enabled);
    if (query.isLoading) return <>…</>;
    const referee = (query.data as RefereeOptionType[] | undefined)?.find((r) => r.id === id);
    return <>{referee?.name ?? "Unknown"}</>;
}

function ExamAddress({ id, enabled }: { id: number; enabled: boolean }) {
    const query = useAddressQuery(id, enabled);
    if (query.isLoading) return <>…</>;
    if (query.data == null) return <>Unknown</>;
    return <>{formatAddress(query.data as AddressType)}</>;
}

type Props = { exam: ExamType; show: boolean; onHide: () => void };

/** What the candidate may see of one of their examinations, read only. */
function ExaminationModal({ exam, show, onHide }: Props) {
    const licenseQuery = useLicenseQuery();
    const licenseName = license(exam.license, licenseQuery.data ?? []) ?? "Examination";
    const titleId = `examination-title-${exam.id}`;
    return (
        <Modal show={show} onHide={onHide} aria-labelledby={titleId}>
            <Modal.Header closeButton>
                <Modal.Title id={titleId}>{licenseName}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <dl className="row mb-0">
                    <dt className="col-4 fw-normal text-body-secondary">License</dt>
                    <dd className="col-8 mb-1">{licenseName}</dd>
                    <dt className="col-4 fw-normal text-body-secondary">Date</dt>
                    <dd className="col-8 mb-1">{exam.date ? formatDate(new Date(exam.date)) : "–"}</dd>
                    <dt className="col-4 fw-normal text-body-secondary">Chief examiner</dt>
                    <dd className="col-8 mb-1">
                        {exam.chief_examiner != null ? <ChiefExaminer id={exam.chief_examiner} enabled={show} /> : "–"}
                    </dd>
                    <dt className="col-4 fw-normal text-body-secondary">Address</dt>
                    <dd className="col-8 mb-1">
                        {exam.address != null ? <ExamAddress id={exam.address} enabled={show} /> : "–"}
                    </dd>
                    <dt className="col-4 fw-normal text-body-secondary">Grade</dt>
                    <dd className="col-8 mb-1">{exam.grade ?? "–"}</dd>
                    <dt className="col-4 fw-normal text-body-secondary">Result</dt>
                    <dd className="col-8 mb-1">
                        {exam.passed
                            ? <><i className="bi bi-check text-success" aria-hidden="true" /> Passed</>
                            : <><i className="bi bi-x text-danger" aria-hidden="true" /> Failed</>}
                    </dd>
                    {exam.note_external && (
                        <>
                            <dt className="col-4 fw-normal text-body-secondary">Note</dt>
                            <dd className="col-8 mb-1" style={{ whiteSpace: "pre-line" }}>{exam.note_external}</dd>
                        </>
                    )}
                </dl>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
}

export default ExaminationModal;
