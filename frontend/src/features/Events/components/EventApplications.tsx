import { FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, Dropdown, Form, InputGroup, Table } from "react-bootstrap";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import api from "../../../lib/api";
import { extractDay } from "../../../lib/helper";
import { CompetitionType } from "../../../lib/types";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useEventApplicationsQuery, useRefereesQuery } from "../hooks/useEventFormQueries";
import { EventApplicationType, RefereeOptionType } from "../utils/EventForm";
import { useIsStaff } from "../../User/hooks/useUserQueries";

function errorMessages(error: unknown, fallback = "The application could not be added."): string[] {
    if (isAxiosError(error) && error.response?.data && typeof error.response.data === "object") {
        const data = error.response.data as Record<string, unknown>;
        return Object.values(data).flatMap((value) => (Array.isArray(value) ? value.map(String) : [String(value)]));
    }
    return [fallback];
}

/** Application.Status in the backend. */
const CANCELLED = -2;
const DECLINED = -3;
const REMOVED = [CANCELLED, DECLINED];

type RemoveProps = { eventId: number; application: EventApplicationType };

/**
 * Admins may set an application to cancelled or declined; staff members
 * may also delete it from the database.
 */
function RemoveApplication({ eventId, application }: RemoveProps) {
    const isStaff = useIsStaff();
    const queryClient = useQueryClient();
    const url = `/api/events/${eventId}/applications/${application.id}/`;

    const mutation = useMutation({
        mutationFn: (status: number | null) => (status === null ? api.delete(url) : api.patch(url, { status })),
        onSuccess: (_data, status) => {
            queryClient.invalidateQueries({ queryKey: ["event", eventId, "applications"] });
            const done = status === null ? "deleted" : status === CANCELLED ? "cancelled" : "declined";
            toast.success(`The application of ${application.name} was ${done}.`);
        },
        onError: (error) => errorMessages(error, "The application could not be changed.").forEach((m) => toast.error(m)),
    });

    function remove() {
        if (window.confirm(`Delete the application of ${application.name}? This cannot be undone.`)) {
            mutation.mutate(null);
        }
    }

    return (
        <Dropdown align="end">
            <Dropdown.Toggle
                variant="outline-secondary"
                size="sm"
                disabled={mutation.isPending}
                aria-label={`Remove the application of ${application.name}`}
            >
                <i className="bi bi-person-dash" aria-hidden="true" /> Remove
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <Dropdown.Item as="button" disabled={application.status === CANCELLED} onClick={() => mutation.mutate(CANCELLED)}>
                    Set to cancelled
                </Dropdown.Item>
                <Dropdown.Item as="button" disabled={application.status === DECLINED} onClick={() => mutation.mutate(DECLINED)}>
                    Set to declined
                </Dropdown.Item>
                {isStaff && (
                    <>
                        <Dropdown.Divider />
                        <Dropdown.Item as="button" className="text-danger" onClick={remove}>
                            Delete from the database
                        </Dropdown.Item>
                    </>
                )}
            </Dropdown.Menu>
        </Dropdown>
    );
}

type DayProps = {
    eventId: number;
    competition: CompetitionType;
    applications: EventApplicationType[];
    referees: RefereeOptionType[];
};

function CompetitionApplications({ eventId, competition, applications, referees }: DayProps) {
    const [referee, setReferee] = useState("");
    const queryClient = useQueryClient();
    const applied = new Set(applications.map((a) => a.user));
    const available = referees.filter((r) => !applied.has(r.id));
    const title = `${extractDay(competition.start)}${competition.info ? ` – ${competition.info}` : ""}`;

    const mutation = useMutation({
        mutationFn: (user: number) =>
            api.post(`/api/events/${eventId}/applications/`, { user, competition: competition.id }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["event", eventId, "applications"] });
            const name = referees.find((r) => r.id === Number(referee))?.name ?? "The referee";
            toast.success(`${name} was added.`);
            setReferee("");
        },
        onError: (error) => errorMessages(error).forEach((message) => toast.error(message)),
    });

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (referee) mutation.mutate(Number(referee));
    }

    const selectId = `add-application-${competition.id}`;
    return (
        <Card className="mb-3" as="section" aria-label={`Applications ${title}`}>
            <Card.Header className="d-flex justify-content-between align-items-center">
                <strong>{title}</strong>
                <Badge bg="secondary" pill>{applications.length}</Badge>
            </Card.Header>
            <Card.Body>
                {applications.length === 0 ? (
                    <p className="text-body-secondary">No applications yet.</p>
                ) : (
                    <Table size="sm" responsive className="mb-3 align-middle">
                        <thead>
                            <tr>
                                <th>Referee</th>
                                <th>Status</th>
                                <th>Applied on</th>
                                <th><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {applications.map((a) => (
                                <tr key={a.id} className={REMOVED.includes(a.status) ? "text-body-secondary" : undefined}>
                                    <td>{a.name}</td>
                                    <td>{a.status_display}</td>
                                    <td>{extractDay(a.created)}</td>
                                    <td className="text-end">
                                        <RemoveApplication eventId={eventId} application={a} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
                <Form onSubmit={handleSubmit}>
                    <Form.Label htmlFor={selectId}>Add an application</Form.Label>
                    <InputGroup>
                        <Form.Select
                            id={selectId}
                            value={referee}
                            onChange={(e) => setReferee(e.target.value)}
                            disabled={mutation.isPending}
                        >
                            <option value="">Choose a referee…</option>
                            {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Form.Select>
                        <Button type="submit" variant="outline-primary" disabled={!referee || mutation.isPending}>
                            <i className="bi bi-person-plus" aria-hidden="true" /> Add
                        </Button>
                    </InputGroup>
                    <Form.Text>
                        Admins may add any referee, also outside the registration period and without the
                        required license or membership.
                    </Form.Text>
                </Form>
            </Card.Body>
        </Card>
    );
}

type Props = { eventId: number; competitions: CompetitionType[] };

/** Applications for every competition day of an event, for its admins. */
function EventApplications({ eventId, competitions }: Props) {
    const applications = useEventApplicationsQuery(eventId);
    const referees = useRefereesQuery();

    if (applications.isLoading || referees.isLoading) return <LoadingIndicator />;
    if (applications.isError || referees.isError) {
        return <Alert variant="danger">The applications could not be loaded.</Alert>;
    }
    return (
        <>
            {competitions.map((competition) => (
                <CompetitionApplications
                    key={competition.id}
                    eventId={eventId}
                    competition={competition}
                    applications={(applications.data ?? []).filter((a) => a.competition === competition.id)}
                    referees={referees.data as RefereeOptionType[]}
                />
            ))}
        </>
    );
}

export default EventApplications;
