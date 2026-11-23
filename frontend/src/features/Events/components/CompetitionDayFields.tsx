import { ChangeEvent } from "react";
import { Button, ButtonGroup, Card, Form, InputGroup, Row } from "react-bootstrap";
import { LicenseType } from "../../../lib/types";
import { extractDay } from "../../../lib/helper";
import MultiSelectDropdown from "../../../components/MultiSelectDropdown";
import { categoryOptions, CategoryType, CompetitionDayForm, FieldErrors, nowLocal, RefereeOptionType } from "../utils/EventForm";
import FormField from "./FormField";

type Options = {
    categories: CategoryType[];
    referees: RefereeOptionType[];
    licenses: LicenseType[];
};

type CompetitionDayFieldsProps = {
    day: CompetitionDayForm;
    index: number;
    errors: FieldErrors;
    options: Options;
    disabled: boolean;
    canRemove: boolean;
    onChange: (patch: Partial<CompetitionDayForm>) => void;
    onCopy: () => void;
    onRemove: () => void;
};

function CompetitionDayFields({
    day, index, errors, options, disabled, canRemove, onChange, onCopy, onRemove,
}: CompetitionDayFieldsProps) {
    const id = (field: string) => `day-${day.key}-${field}`;
    const text = (field: keyof CompetitionDayForm) => ({
        value: day[field] as string,
        onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            onChange({ [field]: e.target.value }),
        isInvalid: Boolean(errors[field]),
        disabled,
    });

    function changeMinimumLevel(e: ChangeEvent<HTMLSelectElement>) {
        // Most competitions want the minimum level, so preselect it.
        const value = e.target.value;
        onChange(day.desiredLevel ? { minimumLevel: value } : { minimumLevel: value, desiredLevel: value });
    }

    const title = `Day ${index + 1}`;
    return (
        <Card className="mb-4" as="section" aria-label={title}>
            <Card.Header className="d-flex align-items-center justify-content-between">
                <span>
                    <strong>{title}</strong>
                    {day.date && <span className="text-body-secondary"> · {extractDay(day.date)}</span>}
                </span>
                <ButtonGroup size="sm">
                    <Button variant="outline-secondary" onClick={onCopy} disabled={disabled}>
                        <i className="bi bi-copy" aria-hidden="true" /> Copy to next day
                    </Button>
                    {canRemove && (
                        <Button variant="outline-danger" onClick={onRemove} disabled={disabled} aria-label={`Remove ${title}`}>
                            <i className="bi bi-trash" aria-hidden="true" /> Remove
                        </Button>
                    )}
                </ButtonGroup>
            </Card.Header>
            <Card.Body>
                <Row>
                    <FormField id={id("date")} label="Date" required md={4} errors={errors.date}>
                        <Form.Control type="date" {...text("date")} />
                    </FormField>
                    <FormField id={id("start")} label="Start" required md={4} errors={errors.startTime}>
                        <Form.Control type="time" {...text("startTime")} />
                    </FormField>
                    <FormField id={id("end")} label="End" required md={4} errors={errors.endTime}>
                        <Form.Control type="time" {...text("endTime")} />
                    </FormField>
                </Row>

                <FormField id={id("category")} label="Categories" required errors={errors.category}>
                    <MultiSelectDropdown
                        id={id("category")}
                        options={categoryOptions(options.categories)}
                        selected={day.category}
                        onChange={(category) => onChange({ category })}
                        searchPlaceholder="Search categories"
                        isInvalid={Boolean(errors.category)}
                        disabled={disabled}
                    />
                </FormField>

                <Row>
                    <FormField id={id("invitor")} label="Invited by" required md={6} errors={errors.invitor}>
                        <Form.Select {...text("invitor")}>
                            <option value="">Choose…</option>
                            {options.referees.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Form.Select>
                    </FormField>
                    <FormField id={id("head-referee")} label="Head referee" md={6} errors={errors.headReferee}>
                        <Form.Select {...text("headReferee")}>
                            <option value="">Not yet known</option>
                            {options.referees.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Form.Select>
                    </FormField>
                </Row>

                <Row>
                    <FormField id={id("minimum-level")} label="Minimum license" required md={6} errors={errors.minimumLevel}>
                        <Form.Select {...text("minimumLevel")} onChange={changeMinimumLevel}>
                            <option value="">Choose…</option>
                            {options.licenses.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Form.Select>
                    </FormField>
                    <FormField id={id("desired-level")} label="Desired license" required md={6} errors={errors.desiredLevel}>
                        <Form.Select {...text("desiredLevel")}>
                            <option value="">Choose…</option>
                            {options.licenses.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Form.Select>
                    </FormField>
                </Row>

                <Row>
                    <FormField id={id("mats")} label="Mats" md={4} errors={errors.competitionFields}>
                        <Form.Control type="number" min={1} max={25} {...text("competitionFields")} />
                    </FormField>
                    <FormField id={id("referees")} label="Referees needed" md={4} errors={errors.referees}>
                        <Form.Control type="number" min={1} max={100} {...text("referees")} />
                    </FormField>
                    <FormField id={id("observers")} label="Observers needed" md={4} errors={errors.observers}>
                        <Form.Control type="number" min={1} max={25} {...text("observers")} />
                    </FormField>
                </Row>

                <Form.Check
                    type="switch"
                    className="mb-3"
                    id={id("application")}
                    label="Referees can apply"
                    checked={day.application}
                    onChange={(e) => onChange({ application: e.target.checked })}
                    disabled={disabled}
                />
                {day.application && (
                    <Row>
                        <FormField id={id("application-open")} label="Registration opens" md={6} errors={errors.applicationOpen}
                            help="Leave empty to open registration right away.">
                            <InputGroup hasValidation>
                                <Form.Control type="datetime-local" {...text("applicationOpen")} />
                                <Button
                                    variant="outline-secondary"
                                    onClick={() => onChange({ applicationOpen: nowLocal() })}
                                    disabled={disabled}
                                    title="Open registration immediately"
                                >
                                    Now
                                </Button>
                            </InputGroup>
                        </FormField>
                        <FormField id={id("application-close")} label="Registration closes" md={6} errors={errors.applicationClose}
                            help="Leave empty to keep it open until the competition starts.">
                            <Form.Control type="datetime-local" {...text("applicationClose")} />
                        </FormField>
                    </Row>
                )}

                <FormField id={id("info")} label="Information" errors={errors.info}>
                    <Form.Control as="textarea" rows={2} placeholder="e.g. age groups, weigh-in, schedule" {...text("info")} />
                </FormField>
            </Card.Body>
        </Card>
    );
}

export default CompetitionDayFields;
