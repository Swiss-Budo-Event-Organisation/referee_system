import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Col, Form, Modal, Row } from "react-bootstrap";
import { toast } from "react-toastify";
import MultiSelectDropdown from "../../../components/MultiSelectDropdown";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useLicenseQuery } from "../../../hooks/useQueries";
import { LicenseType } from "../../../lib/types";
import { useGroupsQuery } from "../hooks/useAccountQueries";
import { approveAccount, fieldErrors, HeldExamination, PendingAccountType } from "../utils/Accounts";

type ExamRow = HeldExamination & { key: number };

let nextKey = 1;
const emptyRow = (): ExamRow => ({ key: nextKey++, license: 0, date: "", grade: "" });

type Props = { account: PendingAccountType; show: boolean; onHide: () => void };

/**
 * Approve a registration: optionally assign groups and record examinations
 * the person already passed. The person then gets an e-mail with a link.
 */
function ApproveModal({ account, show, onHide }: Props) {
    const groups = useGroupsQuery(show);
    const licenses = useLicenseQuery();
    const queryClient = useQueryClient();
    const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
    const [rows, setRows] = useState<ExamRow[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const name = `${account.first_name} ${account.last_name}`.trim() || account.username;

    const mutation = useMutation({
        mutationFn: () => approveAccount(account.id, {
            groups: selectedGroups,
            examinations: rows.map(({ license, date, grade }) => ({ license, date, ...(grade ? { grade } : {}) })),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounts", "pending"] });
            toast.success(`The account of ${name} was approved.`);
            onHide();
        },
        onError: (error) => setErrors(Object.values(fieldErrors(error)).flat()),
    });

    const update = (key: number, change: Partial<HeldExamination>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    const incomplete = rows.some((row) => !row.license || !row.date);

    return (
        <Modal show={show} onHide={onHide} size="lg" aria-labelledby={`approve-title-${account.id}`}>
            <Modal.Header closeButton>
                <Modal.Title id={`approve-title-${account.id}`}>Approve {name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {errors.map((message) => <Alert key={message} variant="danger">{message}</Alert>)}
                <Form.Group className="mb-4">
                    <Form.Label htmlFor={`approve-groups-${account.id}`}>Groups</Form.Label>
                    {groups.isLoading ? <LoadingIndicator center={false} /> : (
                        <MultiSelectDropdown
                            id={`approve-groups-${account.id}`}
                            options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
                            selected={selectedGroups}
                            onChange={setSelectedGroups}
                            placeholder="No groups"
                        />
                    )}
                </Form.Group>
                <h3 className="h6">Examinations already passed</h3>
                {rows.length === 0 && <p className="text-body-secondary small">None recorded.</p>}
                {rows.map((row, index) => (
                    <Row key={row.key} className="g-2 mb-2 align-items-end" aria-label={`Examination ${index + 1}`} role="group">
                        <Col md={5}>
                            <Form.Label htmlFor={`exam-license-${row.key}`} className="small">License</Form.Label>
                            <Form.Select id={`exam-license-${row.key}`} value={row.license}
                                onChange={(e) => update(row.key, { license: Number(e.target.value) })}>
                                <option value={0}>Choose…</option>
                                {(licenses.data ?? []).map((l: LicenseType) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label htmlFor={`exam-date-${row.key}`} className="small">Date</Form.Label>
                            <Form.Control id={`exam-date-${row.key}`} type="date" value={row.date}
                                onChange={(e) => update(row.key, { date: e.target.value })} />
                        </Col>
                        <Col md={2}>
                            <Form.Label htmlFor={`exam-grade-${row.key}`} className="small">Grade</Form.Label>
                            <Form.Control id={`exam-grade-${row.key}`} type="number" step="0.01" min="0" value={row.grade}
                                onChange={(e) => update(row.key, { grade: e.target.value })} />
                        </Col>
                        <Col md={2}>
                            <Button variant="outline-danger" className="w-100"
                                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                                Remove
                            </Button>
                        </Col>
                    </Row>
                ))}
                <Button variant="outline-secondary" size="sm" onClick={() => setRows((current) => [...current, emptyRow()])}>
                    <i className="bi bi-plus me-1" aria-hidden="true" /> Add examination
                </Button>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Cancel</Button>
                <Button variant="success" disabled={incomplete || mutation.isPending} onClick={() => mutation.mutate()}>
                    <i className="bi bi-check-lg me-1" aria-hidden="true" /> Approve
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default ApproveModal;
