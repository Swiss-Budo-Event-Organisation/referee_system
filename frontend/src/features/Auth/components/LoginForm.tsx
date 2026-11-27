import { FormEvent, useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { UserContext } from "../../../layouts/MainLayout";
import {
    AllauthResponse,
    errorMessage,
    isLoggedIn,
    login,
    mfaAuthenticate,
    mfaAuthenticateWebAuthn,
    passkeyLogin,
    pendingFlow,
} from "../../../lib/allauth";
import { getUser } from "../../../lib/auth";
import { autofillSupported, webauthnSupported } from "../../../lib/webauthn";

type Step = { name: "password" } | { name: "mfa"; types: string[] };

const LOGIN_FAILED = "The username or password is wrong, or your account is still awaiting approval.";

/**
 * Login with username and password, then the second factor if the user set
 * one up. Users with a passkey may log in with it alone.
 */
function LoginForm({ next }: { next: string | null }) {
    const [step, setStep] = useState<Step>({ name: "password" });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { setUser } = useContext(UserContext);
    const navigate = useNavigate();
    const destination = next ? "?next=" + next : "";

    function handle(res: AllauthResponse, fallback: string) {
        if (isLoggedIn(res)) {
            setUser({ id: getUser(res.meta?.access_token), isAuthenticated: true });
            navigate(next ? next : "/events");
            return;
        }
        const flow = pendingFlow(res);
        if (res.status === 401 && flow?.id === "mfa_authenticate") {
            setStep({ name: "mfa", types: flow.types ?? [] });
            setError(null);
            return;
        }
        setError(errorMessage(res, fallback));
    }

    async function run(action: () => Promise<AllauthResponse>, fallback: string) {
        setIsLoading(true);
        setError(null);
        try {
            handle(await action(), fallback);
        } catch {
            // Network errors or a cancelled passkey prompt.
            setError(fallback);
        } finally {
            setIsLoading(false);
        }
    }

    // Offer passkeys in the username field's autofill.
    useEffect(() => {
        if (step.name !== "password") return;
        const controller = new AbortController();
        autofillSupported().then((supported) => {
            if (!supported || controller.signal.aborted) return;
            passkeyLogin({ mediation: "conditional", signal: controller.signal })
                .then((res) => handle(res, "The passkey was not accepted."))
                .catch(() => { /* Aborted or dismissed. */ });
        });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.name]);

    function submitPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => login(String(data.get("username") ?? ""), String(data.get("password") ?? "")), LOGIN_FAILED);
    }

    function submitCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        run(() => mfaAuthenticate(String(data.get("code") ?? "").trim()), "The code is wrong.");
    }

    if (step.name === "mfa") {
        const canUseKey = step.types.includes("webauthn") && webauthnSupported();
        const canUseCode = step.types.includes("totp") || step.types.includes("recovery_codes");
        return (
            <div className="container">
                <h1>Two-factor authentication</h1>
                {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
                {canUseCode && (
                    <Form onSubmit={submitCode} className="mt-4">
                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="code">
                                {step.types.includes("totp")
                                    ? "Code from your authenticator app, or a recovery code"
                                    : "Recovery code"}
                            </Form.Label>
                            <Form.Control name="code" id="code" autoComplete="one-time-code"
                                inputMode="numeric" autoFocus disabled={isLoading} />
                        </Form.Group>
                        {isLoading ? <LoadingIndicator /> : <Button type="submit">Verify</Button>}
                    </Form>
                )}
                {canUseKey && !isLoading && (
                    <Button variant="outline-primary" className="mt-3"
                        onClick={() => run(mfaAuthenticateWebAuthn, "The security key was not accepted.")}>
                        Use a passkey or security key
                    </Button>
                )}
                <div className="mt-4">
                    <Button variant="link" className="p-0" onClick={() => { setStep({ name: "password" }); setError(null); }}>
                        Back to login
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <h1>Login</h1>
            <Form onSubmit={submitPassword} className="mt-4">
                {error && <Alert variant="danger">{error}</Alert>}
                <Row>
                    <Form.Group className="mb-3" as={Col}>
                        <Form.Label className="visually-hidden" htmlFor="username">Username</Form.Label>
                        <Form.Control name="username" id="username" type="text" placeholder="Username"
                            autoComplete="username webauthn" disabled={isLoading} />
                    </Form.Group>
                    <Form.Group className="mb-3" as={Col}>
                        <Form.Label className="visually-hidden" htmlFor="password">Password</Form.Label>
                        <Form.Control name="password" id="password" type="password" placeholder="Password"
                            autoComplete="current-password" disabled={isLoading} />
                    </Form.Group>
                </Row>
                <Form.Group className="position-relative">
                    {isLoading ? <LoadingIndicator /> : (
                        <>
                            <Button className="form-button" type="submit">Login</Button>
                            {webauthnSupported() && (
                                <Button variant="outline-primary" className="ms-2"
                                    onClick={() => run(() => passkeyLogin(), "The passkey was not accepted.")}>
                                    Login with a passkey
                                </Button>
                            )}
                            <Link to={"/register" + destination} className="position-absolute end-0">Register</Link>
                        </>
                    )}
                </Form.Group>
            </Form>
        </div>
    );
}

export default LoginForm;
