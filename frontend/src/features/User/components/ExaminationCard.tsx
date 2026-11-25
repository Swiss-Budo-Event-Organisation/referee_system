import { useState } from "react"
import { Button, CardText } from "react-bootstrap"
import CollapsibleCard from "../../../components/CollapsibleCard"
import { ExamType } from "../../../lib/types"
import { license } from "../../../lib/helper"
import LoadingIndicator from "../../../components/LoadingIndicator"
import { useLicenseQuery } from "../../../hooks/useQueries"
import { useExaminationQuery } from "../hooks/useUserQueries"
import ExaminationModal from "./ExaminationModal"

function ExaminationCard({ user }: { user: number }) {
    const examinationQuery = useExaminationQuery(user);
    return (
        <CollapsibleCard title="Examinations">
            {examinationQuery.data == null ? <LoadingIndicator center={false} /> :
                examinationQuery.data.length === 0
                    ? <CardText className="text-body-secondary">No examinations yet.</CardText>
                    : examinationQuery.data.map((elem: ExamType) => <Examination exam={elem} key={elem.id} />)}
        </CollapsibleCard>
    );
}
function Examination({ exam }: { exam: ExamType }) {
    const licenseQuery = useLicenseQuery();
    if (licenseQuery.isLoading) return <LoadingIndicator center={false} ></LoadingIndicator>
    const name = license(exam.license, licenseQuery.data);
    const summary = exam.passed
        ? <>{name} ({exam.date}) <i className="bi bi-check text-success" aria-label="passed"></i></>
        : <><span style={{ color: "gray" }}>{name} ({exam.date})</span> <i className="bi bi-x text-danger" aria-label="failed"></i></>
    return <CardText className="d-flex align-items-center column-gap-2">
        <span className="me-auto">{summary}</span>
        <ShowExamination exam={exam} />
    </CardText>
}

/** A button opening the details of one of the user's examinations. */
function ShowExamination({ exam }: { exam: ExamType }) {
    const [show, setShow] = useState(false);
    return (
        <>
            <Button variant="outline-primary" size="sm" onClick={() => setShow(true)}>
                <i className="bi bi-eye me-1" aria-hidden="true" /> Details
            </Button>
            <ExaminationModal exam={exam} show={show} onHide={() => setShow(false)} />
        </>
    );
}


export default ExaminationCard
