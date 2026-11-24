import { FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import api from "../../../lib/api";
import { extractDay, extractTime } from "../../../lib/helper";
import LoadingIndicator from "../../../components/LoadingIndicator";
import StatusBadge from "../../Events/components/StatusBadge";
import { useRefereesQuery } from "../../Events/hooks/useEventFormQueries";
import { RefereeOptionType } from "../../Events/utils/EventForm";
import { useInvitationQuery } from "../hooks/useInvitationQueries";
import {
    addCopyEmail,
    chooseHeadReferee,
    errorMessages,
    InvitationApplicationType,
    InvitationForm,
    invitationForm,
    InvitationOverviewType,
    invitationPayload,
    invitedReferees,
    toggleReferee,
} from "../utils/Invitation";

/** Application.Status.CANCELLED in the backend. */
const CANCELLED = -2;

function dateTime(value: string): string {
    return `${extractDay(value)} ${extractTime(value)}`;
}

/** A row of the referee table: an application, or a referee added without one. */
type Row = {
    referee: number;
    name: string;
    application?: InvitationApplicationType;
};

type TableProps = {
    rows: Row[];
    form: InvitationForm;
    setForm: (form: InvitationForm) => void;
    disabled: boolean;
    onRemove: (referee: number) => void;
};

function RefereeTable({ rows, form, setForm, disabled, onRemove }: TableProps) {
    if (rows.length === 0) {
        return <p className="text-body-secondary">No applications yet. Add referees below.</p>;
    }
    return (
        <Table size="sm" hover className="align-middle mb-3">
            <thead>
                <tr>
                    <th>Invite</th>
                    <th>Referee</th>
                    <th>Status</th>
                    <th className="text-center">Head referee</th>
                    <th className="text-end">Applied on</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(({ referee, name, application }) => {
                    const selectable = application?.selectable ?? true;
                    const selected = form.referees.includes(referee);
                    return (
                        <tr key={referee} className={selectable ? undefined : "text-body-secondary"}>
                            <td>
                                <Form.Check
                                    id={`invite-${referee}`}
                                    aria-label={`Invite ${name}`}
                                    checked={selected}
                                    disabled={disabled || !selectable}
                                    onChange={() => setForm(toggleReferee(form, referee))}
                                />
                            </td>
                            <td>
                                <label htmlFor={`invite-${referee}`} className="mb-0">{name}</label>
                                {application && !application.has_email && (
                                    <Badge bg="warning" text="dark" className="ms-2 fw-normal" title="This referee will not get the e-mail.">
                                        <i className="bi bi-exclamation-triangle" aria-hidden="true" /> no e-mail address
                                    </Badge>
                                )}
                            </td>
                            <td>
                                {application ? (
                                    <StatusBadge status={application.status} label={application.status_display} />
                                ) : (
                                    <>
                                        <Badge bg="body-tertiary" className="border text-body fw-normal">Not applied</Badge>
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="py-0"
                                            aria-label={`Remove ${name}`}
                                            onClick={() => onRemove(referee)}
                                            disabled={disabled}
                                        >
                                            <i className="bi bi-x-lg" aria-hidden="true" />
                                        </Button>
                                    </>
                                )}
                            </td>
                            <td className="text-center">
                                <Form.Check
                                    type="radio"
                                    name="head-referee"
                                    aria-label={`${name} as head referee`}
                                    checked={form.headReferee === referee}
                                    disabled={disabled || !selectable}
                                    onChange={() => setForm(chooseHeadReferee(form, referee))}
                                />
                            </td>
                            <td className="text-end text-body-secondary">
                                {application ? extractDay(application.created) : "–"}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );
}

type AddProps = { options: RefereeOptionType[]; onAdd: (referee: number) => void; disabled: boolean };

/** Add a referee who did not apply. */
function AddReferee({ options, onAdd, disabled }: AddProps) {
    const [referee, setReferee] = useState("");
    function add() {
        if (!referee) return;
        onAdd(Number(referee));
        setReferee("");
    }
    return (
        <Form.Group>
            <Form.Label htmlFor="add-referee">Add a referee who did not apply</Form.Label>
            <InputGroup>
                <Form.Select id="add-referee" value={referee} onChange={(e) => setReferee(e.target.value)} disabled={disabled}>
                    <option value="">Choose a referee…</option>
                    {options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Form.Select>
                <Button variant="outline-primary" onClick={add} disabled={disabled || !referee}>
                    <i className="bi bi-person-plus" aria-hidden="true" /> Add
                </Button>
            </InputGroup>
        </Form.Group>
    );
}

type RecipientsProps = {
    form: InvitationForm;
    setForm: (form: InvitationForm) => void;
    referees: RefereeOptionType[];
    disabled: boolean;
};

/** Users and e-mail addresses that get a copy of the e-mail. */
function FurtherRecipients({ form, setForm, referees, disabled }: RecipientsProps) {
    const [user, setUser] = useState("");
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState<string | null>(null);
    const users = new Map(referees.filter((r) => r.user !== undefined).map((r) => [r.user as number, r.name]));
    const options = [...users].filter(([id]) => !form.copyUsers.includes(id));

    function addUser() {
        if (!user) return;
        setForm({ ...form, copyUsers: [...form.copyUsers, Number(user)] });
        setUser("");
    }

    function addEmail() {
        const result = addCopyEmail(form, email);
        if (typeof result === "string") {
            setEmailError(result);
            return;
        }
        setForm(result);
        setEmail("");
        setEmailError(null);
    }

    const recipients = [
        ...form.copyUsers.map((id) => ({
            key: `user-${id}`,
            label: users.get(id) ?? "Unknown user",
            icon: "bi-person",
            remove: () => setForm({ ...form, copyUsers: form.copyUsers.filter((u) => u !== id) }),
        })),
        ...form.copyEmails.map((address) => ({
            key: `email-${address}`,
            label: address,
            icon: "bi-at",
            remove: () => setForm({ ...form, copyEmails: form.copyEmails.filter((e) => e !== address) }),
        })),
    ];

    return (
        <fieldset className="mb-3">
            <legend className="form-label fs-6 mb-1">Further recipients</legend>
            {recipients.length > 0 && (
                <ul className="list-unstyled d-flex flex-wrap gap-2 mb-2" aria-label="Further recipients">
                    {recipients.map((r) => (
                        <li key={r.key}>
                            <Badge bg="body-tertiary" className="border text-body fw-normal d-inline-flex align-items-center gap-1">
                                <i className={`bi ${r.icon}`} aria-hidden="true" /> {r.label}
                                <Button
                                    variant="link"
                                    size="sm"
                                    className="p-0 ms-1 lh-1 text-body-secondary"
                                    aria-label={`Remove ${r.label}`}
                                    onClick={r.remove}
                                    disabled={disabled}
                                >
                                    <i className="bi bi-x-lg" aria-hidden="true" />
                                </Button>
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
            <InputGroup size="sm" className="mb-2">
                <Form.Select
                    aria-label="Add a user as recipient"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    disabled={disabled}
                >
                    <option value="">Choose a user…</option>
                    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Form.Select>
                <Button variant="outline-secondary" onClick={addUser} disabled={disabled || !user}>
                    Add user
                </Button>
            </InputGroup>
            <InputGroup size="sm" hasValidation>
                <Form.Control
                    type="email"
                    aria-label="Add an e-mail address as recipient"
                    placeholder="name@example.ch"
                    value={email}
                    isInvalid={emailError !== null}
                    disabled={disabled}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(null);
                    }}
                    onKeyDown={(e) => {
                        // Enter adds the address instead of saving the invitation.
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addEmail();
                        }
                    }}
                />
                <Button variant="outline-secondary" onClick={addEmail} disabled={disabled || !email.trim()}>
                    Add address
                </Button>
                <Form.Control.Feedback type="invalid">{emailError}</Form.Control.Feedback>
            </InputGroup>
            <Form.Text>They get a copy of the e-mail, like you.</Form.Text>
        </fieldset>
    );
}

function Preview({ form, names }: { form: InvitationForm; names: Map<number, string> }) {
    const invited = invitedReferees(form, names);
    const head = invited.find((r) => r.head);
    return (
        <div className="border rounded p-3 bg-body-tertiary small" aria-label="E-mail preview">
            <div className="mb-1"><strong>Head referee:</strong> {head ? head.name : <em>not selected yet</em>}</div>
            <strong>Invited referees ({invited.length}):</strong>
            {invited.length === 0 ? (
                <div className="text-body-secondary">No referee selected yet.</div>
            ) : (
                <ul className="mb-0 ps-3">
                    {invited.map((r) => (
                        <li key={r.id}>{r.head ? <><strong>{r.name}</strong> (head referee)</> : r.name}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

type ContentProps = { data: InvitationOverviewType; referees: RefereeOptionType[] };

function InvitationContent({ data, referees }: ContentProps) {
    const queryClient = useQueryClient();
    const [form, setForm] = useState<InvitationForm>(() => invitationForm(data));
    const [errors, setErrors] = useState<string[]>([]);
    const competition = data.competition;
    const applied = new Set(data.applications.map((a) => a.user));
    const names = new Map(referees.map((r) => [r.id, r.name]));
    data.applications.forEach((a) => names.set(a.user, a.name));

    // Referees selected without an application come after the applications.
    const [added, setAdded] = useState<number[]>(() => form.referees.filter((r) => !applied.has(r)));
    const rows: Row[] = [
        ...data.applications.map((a) => ({ referee: a.user, name: a.name, application: a })),
        ...added.filter((r) => !applied.has(r)).map((r) => ({ referee: r, name: names.get(r) ?? "Unknown referee" })),
    ];
    const listed = new Set(rows.map((r) => r.referee));
    const options = referees.filter((r) => !listed.has(r.id));

    const url = `/api/competition/${competition.id}/invitation/`;
    const mutation = useMutation({
        mutationFn: async (send: boolean) => {
            const payload = invitationPayload(form);
            const response = send ? await api.post(`${url}send/`, payload) : await api.put(url, payload);
            return response.data as InvitationOverviewType;
        },
        onSuccess: (result, send) => {
            setErrors([]);
            queryClient.setQueryData(["competition", competition.id, "invitation"], result);
            queryClient.invalidateQueries({ queryKey: ["event", competition.event] });
            // The new data gives the form a new key, so it starts from what was saved.
            toast.success(send ? "The invitation was sent." : "The invitation was saved.");
            if (result.missing_email?.length) {
                toast.warning(`No e-mail address, so no e-mail for: ${result.missing_email.join(", ")}.`);
            }
        },
        onError: (error) => setErrors(errorMessages(error, "The invitation could not be saved.")),
    });

    function save(e: FormEvent) {
        e.preventDefault();
        mutation.mutate(false);
    }

    function send() {
        const count = invitationPayload(form).referees.length;
        const copies = form.copyUsers.length + form.copyEmails.length;
        const further = copies ? ` and ${copies} further recipient${copies === 1 ? "" : "s"}` : "";
        if (window.confirm(`Send the invitation to ${count} referee${count === 1 ? "" : "s"}${further}?`)) {
            mutation.mutate(true);
        }
    }

    const selected = invitationPayload(form).referees.length;
    const needed = competition.referees;
    const disabled = mutation.isPending;
    const canSend = selected > 0 && form.headReferee !== null && form.subject.trim() !== "";

    return (
        <Form onSubmit={save}>
            {data.last_sent && (
                <Alert variant="info">
                    The invitation was sent on {dateTime(data.last_sent.sent as string)}.{" "}
                    {data.invitation.id === null
                        ? "Changes you send now go out as an update to all invited referees."
                        : "The changes saved since then are not sent yet."}
                </Alert>
            )}
            {!data.last_sent && data.invitation.id !== null && data.invitation.modified && (
                <Alert variant="secondary">Draft saved on {dateTime(data.invitation.modified)}. Not sent yet.</Alert>
            )}
            {errors.length > 0 && (
                <Alert variant="danger">
                    {errors.map((m) => <div key={m}>{m}</div>)}
                </Alert>
            )}
            <Row className="g-4">
                <Col lg={7}>
                    <Card className="shadow-sm">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <strong>Referees</strong>
                            <span className="small">
                                {selected} selected{needed ? ` of ${needed} needed` : ""}
                            </span>
                        </Card.Header>
                        <Card.Body>
                            <RefereeTable
                                rows={rows}
                                form={form}
                                setForm={setForm}
                                disabled={disabled}
                                onRemove={(r) => {
                                    setAdded(added.filter((a) => a !== r));
                                    if (form.referees.includes(r)) setForm(toggleReferee(form, r));
                                }}
                            />
                            <AddReferee
                                options={options}
                                disabled={disabled}
                                onAdd={(r) => {
                                    setAdded([...added, r]);
                                    if (!form.referees.includes(r)) setForm(toggleReferee(form, r));
                                }}
                            />
                            <Form.Text>
                                Saving marks the selected applications as selected and the others as not selected.
                                Sending marks them as invited and declined.
                            </Form.Text>
                            {data.applications.some((a) => a.status === CANCELLED && a.selectable) && (
                                <Form.Text className="d-block mt-1">
                                    <i className="bi bi-shield-lock" aria-hidden="true" /> As a staff member you may also
                                    invite cancelled applications; they become selected, and invited once sent.
                                </Form.Text>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={5}>
                    <Card className="shadow-sm">
                        <Card.Header><strong>E-mail</strong></Card.Header>
                        <Card.Body>
                            <Form.Group className="mb-3" controlId="invitation-subject">
                                <Form.Label>Subject</Form.Label>
                                <Form.Control
                                    value={form.subject}
                                    maxLength={240}
                                    required
                                    disabled={disabled}
                                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3" controlId="invitation-message">
                                <Form.Label>Message</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={7}
                                    value={form.message}
                                    disabled={disabled}
                                    placeholder="Information for the invited referees…"
                                    aria-describedby="invitation-greeting-note"
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                />
                                <Form.Text id="invitation-greeting-note" className="d-block">
                                    <i className="bi bi-info-circle" aria-hidden="true" /> Each e-mail starts with a
                                    personal greeting (“Dear …”), so start your message without one.
                                </Form.Text>
                                <Form.Text>
                                    The e-mail also contains the date and place, the head referee and the list of all
                                    invited referees. You get a copy.
                                </Form.Text>
                            </Form.Group>
                            <FurtherRecipients form={form} setForm={setForm} referees={referees} disabled={disabled} />
                            <Preview form={form} names={names} />
                        </Card.Body>
                        <Card.Footer className="d-flex justify-content-end gap-2">
                            <Button type="submit" variant="outline-primary" disabled={disabled}>
                                <i className="bi bi-save" aria-hidden="true" /> Save
                            </Button>
                            <Button
                                variant="primary"
                                onClick={send}
                                disabled={disabled || !canSend}
                                title={canSend ? undefined : "Select referees, the head referee and a subject first."}
                            >
                                <i className="bi bi-send" aria-hidden="true" /> {data.last_sent ? "Send update" : "Send invitation"}
                            </Button>
                        </Card.Footer>
                    </Card>
                </Col>
            </Row>
        </Form>
    );
}

/** Prepare, save and send the invitation of a competition, for its invitor. */
function InvitationView({ pk }: { pk: number }) {
    const query = useInvitationQuery(pk);
    const referees = useRefereesQuery();

    if (query.isLoading || referees.isLoading) return <LoadingIndicator size="15rem" />;
    if (query.isError || !query.data) {
        const status = isAxiosError(query.error) ? query.error.response?.status : undefined;
        return (
            <Alert variant="warning" className="mt-4">
                {status === 404
                    ? "This competition does not exist."
                    : status === 403
                        ? "Only the invitor of this competition may invite referees."
                        : "The invitation could not be loaded. Please reload the page."}
            </Alert>
        );
    }
    if (referees.isError) {
        return <Alert variant="danger" className="mt-4">The referees could not be loaded. Please reload the page.</Alert>;
    }
    const { competition } = query.data;

    return (
        <div className="mb-5">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div>
                    <h1 className="mb-1">Invitation</h1>
                    <div className="text-body-secondary">
                        <strong className="text-body">{competition.event_name}</strong>
                        <span className="mx-2">·</span>
                        <i className="bi bi-calendar-event" aria-hidden="true" /> {extractDay(competition.start)},{" "}
                        {extractTime(competition.start)}–{extractTime(competition.end)}
                        <span className="mx-2">·</span>
                        <i className="bi bi-geo-alt" aria-hidden="true" /> {competition.location}
                        {competition.info && <><span className="mx-2">·</span>{competition.info}</>}
                    </div>
                </div>
                <Link to={`/events/${competition.event}`} className="btn btn-outline-secondary">
                    <i className="bi bi-arrow-left" aria-hidden="true" /> Back to event
                </Link>
            </div>
            {/* A new key starts the form from what was saved. */}
            <InvitationContent
                key={`${query.data.invitation.id}-${query.data.invitation.modified}-${query.data.last_sent?.sent}`}
                data={query.data}
                referees={referees.data as RefereeOptionType[]}
            />
        </div>
    );
}

export default InvitationView;
