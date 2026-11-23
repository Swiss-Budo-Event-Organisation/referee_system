import { ChangeEvent, FormEvent, useState } from "react";
import { Alert, Button, Card, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import api from "../../../lib/api";
import { LocationType } from "../../../lib/types";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useLicenseQuery } from "../../../hooks/useQueries";
import { useCategoriesQuery, useLocationsQuery, useRefereesQuery } from "../hooks/useEventFormQueries";
import {
    buildEventPayload,
    CompetitionDayForm,
    EditableEventType,
    emptyCompetitionDay,
    emptyErrors,
    emptyEventForm,
    eventToForm,
    EventForm as EventFormState,
    EventFormErrors,
    hasErrors,
    NewLocationForm,
    nextCompetitionDay,
    parseServerErrors,
    validateEventForm,
} from "../utils/EventForm";
import CompetitionDayFields from "./CompetitionDayFields";
import FormField from "./FormField";

/** Where to go after saving: the event's detail page or its edit page. */
type NextPage = "detail" | "edit";

type SaveRequest = { payload: ReturnType<typeof buildEventPayload>; next: NextPage };

type Props = {
    /** The event to edit; without it a new event is created. */
    event?: EditableEventType;
};

function EventForm({ event }: Props) {
    const editing = event !== undefined;
    const [form, setForm] = useState<EventFormState>(() => (event ? eventToForm(event) : emptyEventForm()));
    const [errors, setErrors] = useState<EventFormErrors>(emptyErrors);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const locations = useLocationsQuery();
    const categories = useCategoriesQuery();
    const referees = useRefereesQuery();
    const licenses = useLicenseQuery();

    // Without any locations there is nothing to choose from.
    const noLocations = locations.isSuccess && locations.data.length === 0;
    const locationMode = noLocations ? "new" : form.locationMode;

    const mutation = useMutation({
        mutationFn: ({ payload }: SaveRequest): Promise<EditableEventType> =>
            (editing
                ? api.put(`/api/events/${event.id}/edit/`, payload)
                : api.post("/api/events/create/", payload)
            ).then((res) => res.data),
        onSuccess: (saved, { next }) => {
            queryClient.invalidateQueries({ queryKey: ["events"] });
            queryClient.invalidateQueries({ queryKey: ["event", saved.id] });
            queryClient.invalidateQueries({ queryKey: ["locations"] });
            toast.success(editing ? `${saved.name} was saved.` : `${saved.name} was created.`);
            if (next === "detail") {
                navigate(`/events/${saved.id}`);
            } else if (editing) {
                // Stay here; new days now have an id.
                setForm(eventToForm(saved));
                setErrors(emptyErrors());
            } else {
                navigate(`/events/${saved.id}/edit`);
            }
        },
        onError: (error) => {
            if (isAxiosError(error) && error.response?.status === 400) {
                setErrors(parseServerErrors(error.response.data));
            } else if (isAxiosError(error) && error.response?.status === 403) {
                const detail = error.response.data?.detail;
                const fallback = editing ? "You may not edit this event." : "You may not create this event.";
                setErrors({ ...emptyErrors(), general: [detail ?? fallback] });
            } else {
                setErrors({ ...emptyErrors(), general: ["The event could not be saved. Please try again."] });
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        },
    });

    const queries = [locations, categories, referees, licenses];
    if (queries.some((q) => q.isLoading)) return <LoadingIndicator size="15rem" />;
    if (queries.some((q) => q.isError)) {
        return <Alert variant="danger">The form could not be loaded. Please reload the page.</Alert>;
    }

    const disabled = mutation.isPending;
    const options = {
        categories: categories.data,
        referees: referees.data,
        licenses: licenses.data,
    };

    const update = (patch: Partial<EventFormState>) => setForm((prev) => ({ ...prev, ...patch }));
    const eventField = (field: "name" | "info" | "location") => ({
        value: form[field],
        onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            update({ [field]: e.target.value }),
        isInvalid: Boolean(errors.event[field]),
        disabled,
    });
    const locationField = (field: keyof NewLocationForm) => ({
        value: form.newLocation[field],
        onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setForm((prev) => ({ ...prev, newLocation: { ...prev.newLocation, [field]: e.target.value } })),
        isInvalid: Boolean(errors.newLocation[field]),
        disabled,
    });

    function updateDay(index: number, patch: Partial<CompetitionDayForm>) {
        setForm((prev) => ({
            ...prev,
            competitions: prev.competitions.map((day, i) => (i === index ? { ...day, ...patch } : day)),
        }));
    }

    function insertDayAfter(index: number) {
        setForm((prev) => {
            const competitions = [...prev.competitions];
            competitions.splice(index + 1, 0, nextCompetitionDay(prev.competitions[index]));
            return { ...prev, competitions };
        });
        // Errors are stored by position, so they no longer line up.
        setErrors((prev) => ({ ...prev, competitions: {} }));
    }

    function addDay() {
        setForm((prev) => {
            const last = prev.competitions[prev.competitions.length - 1];
            const day = last ? nextCompetitionDay(last) : emptyCompetitionDay();
            return { ...prev, competitions: [...prev.competitions, day] };
        });
    }

    function removeDay(index: number) {
        setForm((prev) => ({ ...prev, competitions: prev.competitions.filter((_, i) => i !== index) }));
        setErrors((prev) => ({ ...prev, competitions: {} }));
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const current = { ...form, locationMode };
        const found = validateEventForm(current);
        setErrors(found);
        if (hasErrors(found)) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        // Each submit button names the page to show after saving.
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const next: NextPage = submitter?.dataset.next === "edit" ? "edit" : "detail";
        mutation.mutate({ payload: buildEventPayload(current), next });
    }


    const errorCount =
        Object.keys(errors.event).length +
        Object.keys(errors.newLocation).length +
        Object.values(errors.competitions).reduce((sum, day) => sum + Object.keys(day).length, 0);

    return (
        <Form noValidate onSubmit={handleSubmit} className="mb-5">
            <h1 className="mb-4">{editing ? `Edit ${event.name}` : "New Event"}</h1>

            {(errors.general.length > 0 || errorCount > 0) && (
                <Alert variant="danger">
                    {errors.general.map((message) => <div key={message}>{message}</div>)}
                    {errorCount > 0 && <div>Please correct the highlighted fields.</div>}
                </Alert>
            )}

            <Card className="mb-4" as="section" aria-label="Event">
                <Card.Header><strong>Event</strong></Card.Header>
                <Card.Body>
                    <FormField id="event-name" label="Name" required errors={errors.event.name}>
                        <Form.Control type="text" placeholder="e.g. Swiss Judo Open" {...eventField("name")} />
                    </FormField>
                    <FormField id="event-info" label="Information" errors={errors.event.info}>
                        <Form.Control as="textarea" rows={3} {...eventField("info")} />
                    </FormField>

                    <Form.Label as="div">Location<span className="text-danger" aria-hidden="true"> *</span></Form.Label>
                    <div className="mb-2">
                        <Form.Check
                            inline type="radio" name="location-mode" id="location-existing" label="Existing location"
                            checked={locationMode === "existing"} disabled={disabled || noLocations}
                            onChange={() => update({ locationMode: "existing" })}
                        />
                        <Form.Check
                            inline type="radio" name="location-mode" id="location-new" label="New location"
                            checked={locationMode === "new"} disabled={disabled}
                            onChange={() => update({ locationMode: "new" })}
                        />
                    </div>
                    {locationMode === "existing" ? (
                        <FormField id="event-location" label="Venue" errors={errors.event.location}>
                            <Form.Select {...eventField("location")}>
                                <option value="">Choose…</option>
                                {(locations.data as LocationType[]).map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </Form.Select>
                        </FormField>
                    ) : (
                        <>
                            {errors.event.location?.map((message) => (
                                <div key={message} className="invalid-feedback d-block mb-2">{message}</div>
                            ))}
                            <Row>
                                <FormField id="location-name" label="Venue name" required md={6} errors={errors.newLocation.name}>
                                    <Form.Control type="text" {...locationField("name")} />
                                </FormField>
                                <FormField id="location-description" label="Description" md={6} errors={errors.newLocation.description}>
                                    <Form.Control type="text" placeholder="e.g. entrance, parking" {...locationField("description")} />
                                </FormField>
                            </Row>
                            <Row>
                                <FormField id="location-street" label="Street" required md={9} errors={errors.newLocation.street}>
                                    <Form.Control type="text" {...locationField("street")} />
                                </FormField>
                                <FormField id="location-house-number" label="Number" md={3} errors={errors.newLocation.houseNumber}>
                                    <Form.Control type="text" {...locationField("houseNumber")} />
                                </FormField>
                            </Row>
                            <Row>
                                <FormField id="location-area-code" label="Postal code" md={3} errors={errors.newLocation.areaCode}>
                                    <Form.Control type="text" {...locationField("areaCode")} />
                                </FormField>
                                <FormField id="location-city" label="City" required md={5} errors={errors.newLocation.city}>
                                    <Form.Control type="text" {...locationField("city")} />
                                </FormField>
                                <FormField id="location-country" label="Country" md={4} errors={errors.newLocation.country}>
                                    <Form.Control type="text" {...locationField("country")} />
                                </FormField>
                            </Row>
                        </>
                    )}
                </Card.Body>
            </Card>

            <h2 className="h4 mb-3">Competition days</h2>
            {form.competitions.map((day, index) => (
                <CompetitionDayFields
                    key={day.key}
                    day={day}
                    index={index}
                    errors={errors.competitions[index] ?? {}}
                    options={options}
                    disabled={disabled}
                    canRemove={form.competitions.length > 1}
                    onChange={(patch) => updateDay(index, patch)}
                    onCopy={() => insertDayAfter(index)}
                    onRemove={() => removeDay(index)}
                />
            ))}
            <Button variant="outline-primary" className="mb-4" onClick={addDay} disabled={disabled}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Add competition day
            </Button>

            <div className="d-flex flex-wrap justify-content-end gap-2 border-top pt-3">
                <Link to={editing ? `/events/${event.id}` : "/events"} className="btn btn-outline-secondary me-auto">
                    Cancel
                </Link>
                <Button type="submit" variant="outline-primary" disabled={disabled} data-next="edit">
                    {editing ? "Save and continue editing" : "Save and edit"}
                </Button>
                <Button type="submit" disabled={disabled} data-next="detail">
                    {disabled ? "Saving…" : "Save"}
                </Button>
            </div>
        </Form>
    );
}

export default EventForm;
