import { FormEvent, Fragment, ReactNode, useState } from "react";
import { Alert, Button, Form, Row } from "react-bootstrap";
import FormField from "../../Events/components/FormField";
import CollapsibleCard from "../../../components/CollapsibleCard";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { FieldErrors, fieldErrors } from "../../Accounts/utils/Accounts";

export type SectionValue = string | boolean | null | undefined;
export type SectionValues = Record<string, SectionValue>;

export type SectionField = {
    name: string;
    label: string;
    type?: "text" | "tel" | "date" | "email" | "switch";
    required?: boolean;
    autoComplete?: string;
    md?: number;
    help?: string;
    /** How the value is shown outside the edit mode. */
    display?: (value: SectionValue) => ReactNode;
};

type ProfileSectionProps = {
    title: string;
    fields: SectionField[];
    values: SectionValues;
    /** Save the edited values; a rejected request's field errors are shown. */
    onSave: (values: SectionValues) => Promise<unknown>;
    /** Errors found before saving, by field. */
    validate?: (values: SectionValues) => FieldErrors;
    /** Replaces the list of values outside the edit mode. */
    summary?: ReactNode;
    footer?: ReactNode;
    /** Whether the section starts open; it starts collapsed by default. */
    defaultOpen?: boolean;
    /** Whether the section is being edited; the page edits one at a time. */
    editing: boolean;
    /** Asks to edit the section; false if another one is being edited. */
    onEdit: () => boolean;
    /** The section was saved or the editing cancelled. */
    onDone: () => void;
};

function shown(field: SectionField, value: SectionValue): ReactNode {
    if (field.display) return field.display(value);
    if (field.type === "switch") return value ? "Yes" : "No";
    return value ? String(value) : <span className="text-body-secondary">Not given</span>;
}

/**
 * A collapsible card of profile data. The pen in its header opens it as a
 * form to edit that part of the profile.
 */
function ProfileSection({
    title, fields, values, onSave, validate, summary, footer, defaultOpen = false, editing, onEdit, onDone,
}: ProfileSectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);

    function edit() {
        if (onEdit()) setOpen(true);
    }

    function stopEditing() {
        setErrors({});
        onDone();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const data: SectionValues = {};
        for (const { name, type } of fields) {
            data[name] = type === "switch" ? form.get(name) === "on" : String(form.get(name) ?? "").trim();
        }
        const missing: FieldErrors = Object.fromEntries(
            fields.filter((field) => field.required && !data[field.name])
                .map(({ name }) => [name, ["This field is required."]]),
        );
        const found = { ...missing, ...validate?.(data) };
        if (Object.keys(found).length) {
            setErrors(found);
            return;
        }
        setSaving(true);
        try {
            await onSave(data);
            stopEditing();
        } catch (error) {
            setErrors(fieldErrors(error));
        } finally {
            setSaving(false);
        }
    }

    const id = (name: string) => `profile-${name}`;
    const pen = !editing && (
        <Button variant="link" size="sm" className="p-0" aria-label={`Edit ${title.toLowerCase()}`}
            title="Edit" onClick={edit}>
            <i className="bi bi-pencil" aria-hidden="true" />
        </Button>
    );
    return (
        <CollapsibleCard title={title} open={open || editing} onToggle={setOpen} actions={pen}>
            {editing ? (
                <Form onSubmit={handleSubmit} noValidate aria-label={title}>
                    {errors.general?.map((message) => <Alert key={message} variant="danger">{message}</Alert>)}
                    <Row>
                        {fields.map((field) => field.type === "switch" ? (
                            <Form.Group key={field.name} className="mb-2" controlId={id(field.name)}>
                                <Form.Check type="switch" name={field.name} label={field.label}
                                    defaultChecked={Boolean(values[field.name])} disabled={saving} />
                            </Form.Group>
                        ) : (
                            <FormField key={field.name} id={id(field.name)} label={field.label} md={field.md ?? 12}
                                errors={errors[field.name]} required={field.required} help={field.help}>
                                <Form.Control name={field.name} type={field.type ?? "text"}
                                    autoComplete={field.autoComplete} defaultValue={String(values[field.name] ?? "")}
                                    isInvalid={Boolean(errors[field.name])} disabled={saving} />
                            </FormField>
                        ))}
                    </Row>
                    {saving ? <LoadingIndicator center={false} /> : (
                        <div className="d-flex gap-2">
                            <Button type="submit">Save</Button>
                            <Button variant="outline-secondary" onClick={stopEditing}>Cancel</Button>
                        </div>
                    )}
                </Form>
            ) : (
                <>
                    {summary ?? (
                        <dl className="row mb-0">
                            {fields.map((field) => (
                                <Fragment key={field.name}>
                                    <dt className="col-sm-4">{field.label}</dt>
                                    <dd className="col-sm-8">{shown(field, values[field.name])}</dd>
                                </Fragment>
                            ))}
                        </dl>
                    )}
                    {footer}
                </>
            )}
        </CollapsibleCard>
    );
}

export default ProfileSection;
