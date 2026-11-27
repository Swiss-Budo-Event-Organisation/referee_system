import { FormEvent, useState } from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import {
    AllauthResponse,
    errorMessage,
    Flow,
    mfaReauthenticate,
    reauthenticate,
    webauthnReauthenticate,
} from "../../../lib/allauth";
import { webauthnSupported } from "../../../lib/webauthn";

type Props = {
    flows: Flow[];
    onDone: (confirmed: boolean) => void;
};

/**
 * Asks the user to confirm it is them before a sensitive change: with the
 * password or a second factor, whichever allauth offers.
 */
function ReauthModal({ flows, onDone }: Props) {
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const byPassword = flows.some((flow) => flow.id === "reauthenticate");
    const mfaTypes = flows.find((flow) => flow.id === "mfa_reauthenticate")?.types ?? [];
    const byCode = mfaTypes.includes("totp") || mfaTypes.includes("recovery_codes");
    const byKey = mfaTypes.includes("webauthn") && webauthnSupported();

    async function confirm(action: () => Promise<AllauthResponse>, fallback: string) {
        setBusy(true);
        setError(null);
        try {
            const res = await action();
            if (res.status === 200) onDone(true);
            else setError(errorMessage(res, fallback));
        } catch {
            setError(fallback);
        } finally {
            setBusy(false);
        }
    }

    function field(event: FormEvent<HTMLFormElement>, name: string): string {
        event.preventDefault();
        return String(new FormData(event.currentTarget).get(name) ?? "");
    }

    return (
        <Modal show onHide={() => onDone(false)} centered>
            <Modal.Header closeButton>
                <Modal.Title>Confirm it is you</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {error && <Alert variant="danger">{error}</Alert>}
                {byPassword && (
                    <Form onSubmit={(e) => { const value = field(e, "password"); confirm(() => reauthenticate(value), "The password is wrong."); }}>
                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="reauth-password">Password</Form.Label>
                            <Form.Control id="reauth-password" name="password" type="password"
                                autoComplete="current-password" autoFocus disabled={busy} />
                        </Form.Group>
                        <Button type="submit" disabled={busy}>Confirm</Button>
                    </Form>
                )}
                {byCode && (
                    <Form className={byPassword ? "mt-4" : ""}
                        onSubmit={(e) => { const value = field(e, "code").trim(); confirm(() => mfaReauthenticate(value), "The code is wrong."); }}>
                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="reauth-code">
                                {byPassword ? "Or a code from your authenticator app" : "Code from your authenticator app"}
                            </Form.Label>
                            <Form.Control id="reauth-code" name="code" autoComplete="one-time-code"
                                inputMode="numeric" disabled={busy} />
                        </Form.Group>
                        <Button type="submit" variant="outline-primary" disabled={busy}>Confirm with code</Button>
                    </Form>
                )}
                {byKey && (
                    <Button variant="outline-primary" className="mt-4" disabled={busy}
                        onClick={() => confirm(webauthnReauthenticate, "The security key was not accepted.")}>
                        Use a passkey or security key
                    </Button>
                )}
            </Modal.Body>
        </Modal>
    );
}

export default ReauthModal;
