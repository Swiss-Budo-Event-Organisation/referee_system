import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form, Row } from "react-bootstrap";
import FormField from "../../Events/components/FormField";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { FieldErrors, fieldErrors, register, RegistrationData } from "../utils/Accounts";

const FIELDS: { name: keyof RegistrationData; label: string; type: string; autoComplete: string }[] = [
    { name: "first_name", label: "First name", type: "text", autoComplete: "given-name" },
    { name: "last_name", label: "Last name", type: "text", autoComplete: "family-name" },
    { name: "username", label: "Username", type: "text", autoComplete: "username" },
    { name: "email", label: "E-mail address", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
    { name: "password_repeat", label: "Repeat the password", type: "password", autoComplete: "new-password" },
];

/**
 * Registration of a new account. The account waits for a staff member's
 * approval; the user is told so here and by e-mail.
 */
function RegisterForm() {
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const data = Object.fromEntries(FIELDS.map(({ name }) => [name, String(form.get(name) ?? "")])) as RegistrationData;
        if (data.password !== data.password_repeat) {
            setErrors({ password_repeat: ["The passwords do not match."] });
            return;
        }
        setSaving(true);
        try {
            await register(data);
            setDone(true);
        } catch (error) {
            setErrors(fieldErrors(error));
        } finally {
            setSaving(false);
        }
    }

    if (done) {
        return (
            <div className="container">
                <h1>Register</h1>
                <Alert variant="success" className="mt-4">
                    <Alert.Heading as="h2" className="h5">Your registration is awaiting approval</Alert.Heading>
                    <p className="mb-0">
                        A staff member will review your account. We sent you an e-mail, and you will get another
                        one with a link once your account is approved. Until then you cannot log in.
                    </p>
                </Alert>
                <Link to="/login">Back to the login</Link>
            </div>
        );
    }

    return (
        <div className="container">
            <h1>Register</h1>
            <p className="text-body-secondary">
                A staff member approves new accounts before you can log in.
            </p>
            <Form onSubmit={handleSubmit} noValidate className="mt-3">
                {errors.general?.map((message) => <Alert key={message} variant="danger">{message}</Alert>)}
                <Row xs={1} md={2}>
                    {FIELDS.map(({ name, label, type, autoComplete }) => (
                        <FormField key={name} id={`register-${name}`} label={label} errors={errors[name]} required>
                            <Form.Control
                                name={name}
                                type={type}
                                autoComplete={autoComplete}
                                required
                                isInvalid={Boolean(errors[name])}
                                disabled={saving}
                            />
                        </FormField>
                    ))}
                </Row>
                <div className="d-flex align-items-center">
                    {saving ? <LoadingIndicator center={false} /> : <Button type="submit">Register</Button>}
                    <Link to="/login" className="ms-auto">Login</Link>
                </div>
            </Form>
        </div>
    );
}

export default RegisterForm;
