import { ReactNode } from "react";
import { Col, Form } from "react-bootstrap";

type FormFieldProps = {
    id: string;
    label: string;
    errors?: string[];
    required?: boolean;
    md?: number;
    help?: string;
    children: ReactNode;
};

/** Label, control and error messages of one form field. */
function FormField({ id, label, errors, required = false, md, help, children }: FormFieldProps) {
    return (
        <Form.Group as={Col} md={md} className="mb-3" controlId={id}>
            <Form.Label>
                {label}
                {required && <span className="text-danger" aria-hidden="true"> *</span>}
            </Form.Label>
            {children}
            {help && <Form.Text muted>{help}</Form.Text>}
            {errors?.map((message) => (
                // d-block: the control may be wrapped, e.g. in an input group.
                <Form.Control.Feedback key={message} type="invalid" className="d-block">
                    {message}
                </Form.Control.Feedback>
            ))}
        </Form.Group>
    );
}

export default FormField;
