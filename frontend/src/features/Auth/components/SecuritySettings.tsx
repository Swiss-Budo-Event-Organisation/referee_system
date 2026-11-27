import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, InputGroup, ListGroup } from "react-bootstrap";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-toastify";
import LoadingIndicator from "../../../components/LoadingIndicator";
import {
    activateTOTP,
    addWebAuthn,
    Authenticator,
    deactivateTOTP,
    deleteWebAuthn,
    errorMessage,
    getAuthenticators,
    getRecoveryCodes,
    getTOTP,
    getWebAuthnCreationOptions,
    regenerateRecoveryCodes,
    renameWebAuthn,
} from "../../../lib/allauth";
import { createCredential, webauthnSupported } from "../../../lib/webauthn";
import { useReauth } from "../hooks/useReauth";

function date(timestamp: number | null): string {
    return timestamp ? new Date(timestamp * 1000).toLocaleDateString() : "never";
}

type Reauth = ReturnType<typeof useReauth>["withReauth"];

function AuthenticatorApp({ active, reload, withReauth }: { active?: Authenticator; reload: () => void; withReauth: Reauth }) {
    const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function start() {
        const res = await getTOTP();
        const meta = res.meta as { secret?: string; totp_url?: string } | undefined;
        if (res.status === 404 && meta?.secret && meta.totp_url) {
            setSetup({ secret: meta.secret, url: meta.totp_url });
        } else {
            toast.error(errorMessage(res, "The setup could not be started."));
        }
    }

    async function activate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
        const res = await withReauth(() => activateTOTP(code));
        if (res.status === 200) {
            setSetup(null);
            setError(null);
            toast.success("The authenticator app is set up.");
            reload();
        } else {
            setError(errorMessage(res, "The code is wrong."));
        }
    }

    async function deactivate() {
        if (!window.confirm("Remove the authenticator app? Its codes will stop working.")) return;
        const res = await withReauth(() => deactivateTOTP());
        if (res.status === 200) {
            toast.success("The authenticator app was removed.");
            reload();
        } else {
            toast.error(errorMessage(res));
        }
    }

    return (
        <Card className="mb-4">
            <Card.Header as="h2" className="h5">Authenticator app</Card.Header>
            <Card.Body>
                {active ? (
                    <>
                        <p>Set up on {date(active.created_at)}, last used {date(active.last_used_at)}.</p>
                        <Button variant="outline-danger" onClick={deactivate}>Remove</Button>
                    </>
                ) : setup ? (
                    <Form onSubmit={activate}>
                        <p>Scan the code with an authenticator app, then enter the code it shows.</p>
                        <div className="bg-white p-3 d-inline-block mb-3">
                            <QRCodeSVG value={setup.url} size={180} title="QR code for the authenticator app" />
                        </div>
                        <p className="small">Or enter this key by hand: <code>{setup.secret}</code></p>
                        {error && <Alert variant="danger">{error}</Alert>}
                        <Form.Group className="mb-3">
                            <Form.Label htmlFor="totp-code">Code</Form.Label>
                            <Form.Control id="totp-code" name="code" autoComplete="one-time-code" inputMode="numeric" />
                        </Form.Group>
                        <Button type="submit">Activate</Button>
                        <Button variant="link" onClick={() => setSetup(null)}>Cancel</Button>
                    </Form>
                ) : (
                    <>
                        <p>Log in with a code from an app such as a password manager or an authenticator app.</p>
                        <Button onClick={start}>Set up</Button>
                    </>
                )}
            </Card.Body>
        </Card>
    );
}

function SecurityKey({ authenticator, reload, withReauth }: { authenticator: Authenticator; reload: () => void; withReauth: Reauth }) {
    const [editing, setEditing] = useState(false);

    async function rename(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
        const res = await withReauth(() => renameWebAuthn(authenticator.id!, name));
        if (res.status === 200) {
            setEditing(false);
            reload();
        } else {
            toast.error(errorMessage(res));
        }
    }

    async function remove() {
        if (!window.confirm(`Remove "${authenticator.name}"? You can no longer log in with it.`)) return;
        const res = await withReauth(() => deleteWebAuthn([authenticator.id!]));
        if (res.status === 200) {
            toast.success(`"${authenticator.name}" was removed.`);
            reload();
        } else {
            toast.error(errorMessage(res));
        }
    }

    return (
        <ListGroup.Item>
            {editing ? (
                <Form onSubmit={rename}>
                    <InputGroup>
                        <Form.Control name="name" aria-label="Name" defaultValue={authenticator.name} maxLength={100} required autoFocus />
                        <Button type="submit">Save</Button>
                        <Button variant="outline-secondary" onClick={() => setEditing(false)}>Cancel</Button>
                    </InputGroup>
                </Form>
            ) : (
                <div className="d-flex flex-wrap align-items-center gap-2">
                    <div className="me-auto">
                        <strong>{authenticator.name}</strong>{" "}
                        {authenticator.is_passwordless && <Badge bg="info">Passkey</Badge>}
                        <div className="small text-body-secondary">
                            Added {date(authenticator.created_at)}, last used {date(authenticator.last_used_at)}
                        </div>
                    </div>
                    <Button size="sm" variant="outline-secondary" onClick={() => setEditing(true)}>Rename</Button>
                    <Button size="sm" variant="outline-danger" onClick={remove}>Remove</Button>
                </div>
            )}
        </ListGroup.Item>
    );
}

function SecurityKeys({ keys, reload, withReauth }: { keys: Authenticator[]; reload: () => void; withReauth: Reauth }) {
    const [busy, setBusy] = useState(false);
    const supported = webauthnSupported();

    async function add(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const name = String(data.get("name") ?? "").trim();
        const passwordless = data.get("passwordless") === "on";
        setBusy(true);
        try {
            const options = await withReauth(() => getWebAuthnCreationOptions(passwordless));
            if (options.status !== 200) {
                toast.error(errorMessage(options));
                return;
            }
            const credential = await createCredential(options.data.creation_options);
            const res = await withReauth(() => addWebAuthn(name, credential));
            if (res.status !== 200) {
                toast.error(errorMessage(res, "The key could not be added."));
                return;
            }
            form.reset();
            toast.success(res.meta?.recovery_codes_generated
                ? "The key was added. Save your recovery codes below."
                : "The key was added.");
            reload();
        } catch {
            toast.error("The key could not be added.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-4">
            <Card.Header as="h2" className="h5">Passkeys and security keys</Card.Header>
            <Card.Body>
                <p>
                    A passkey logs you in without a password. A security key can also serve as the
                    second step after your password. Add more than one, in case you lose a device.
                </p>
                {keys.length > 0 && (
                    <ListGroup className="mb-3">
                        {keys.map((key) => <SecurityKey key={key.id} authenticator={key} reload={reload} withReauth={withReauth} />)}
                    </ListGroup>
                )}
                {supported ? (
                    <Form onSubmit={add}>
                        <InputGroup className="mb-2">
                            <Form.Control name="name" aria-label="Name of the new key" placeholder="Name, e.g. Laptop" maxLength={100} disabled={busy} />
                            <Button type="submit" disabled={busy}>Add</Button>
                        </InputGroup>
                        <Form.Check id="passwordless" name="passwordless" defaultChecked disabled={busy}
                            label="Use it as a passkey, to log in without a password" />
                    </Form>
                ) : (
                    <Alert variant="secondary" className="mb-0">This browser does not support passkeys.</Alert>
                )}
            </Card.Body>
        </Card>
    );
}

function RecoveryCodes({ summary, withReauth }: { summary?: Authenticator; withReauth: Reauth }) {
    const [codes, setCodes] = useState<string[] | null>(null);

    async function show() {
        const res = await withReauth(() => getRecoveryCodes());
        if (res.status === 200) setCodes(res.data?.unused_codes ?? []);
        else toast.error(errorMessage(res));
    }

    async function regenerate() {
        if (!window.confirm("Create new recovery codes? The old ones stop working.")) return;
        const res = await withReauth(() => regenerateRecoveryCodes());
        if (res.status === 200) {
            setCodes(res.data?.unused_codes ?? []);
            toast.success("New recovery codes were created.");
        } else {
            toast.error(errorMessage(res));
        }
    }

    return (
        <Card className="mb-4">
            <Card.Header as="h2" className="h5">Recovery codes</Card.Header>
            <Card.Body>
                {!summary ? (
                    <p className="mb-0">Created with your first authenticator app or security key.</p>
                ) : (
                    <>
                        <p>
                            Each code logs you in once if you lose your other factors. Keep them somewhere
                            safe. {summary.unused_code_count} of {summary.total_code_count} are unused.
                        </p>
                        {codes && (
                            <ul className="list-unstyled font-monospace row row-cols-2 row-cols-sm-5 mb-3" aria-label="Recovery codes">
                                {codes.map((code) => <li key={code} className="col">{code}</li>)}
                            </ul>
                        )}
                        {!codes && <Button className="me-2" onClick={show}>Show codes</Button>}
                        <Button variant="outline-secondary" onClick={regenerate}>Create new codes</Button>
                    </>
                )}
            </Card.Body>
        </Card>
    );
}

/** Second factors of the logged-in user: authenticator app, keys, recovery codes. */
function SecuritySettings() {
    const [authenticators, setAuthenticators] = useState<Authenticator[] | null>(null);
    const [failed, setFailed] = useState(false);
    const { withReauth, dialog } = useReauth();

    const reload = useCallback(() => {
        getAuthenticators()
            .then((res) => {
                if (res.status === 200) setAuthenticators(res.data ?? []);
                else setFailed(true);
            })
            .catch(() => setFailed(true));
    }, []);

    useEffect(reload, [reload]);

    if (failed) return <Alert variant="danger">The security settings could not be loaded.</Alert>;
    if (authenticators === null) return <LoadingIndicator />;

    const totp = authenticators.find((a) => a.type === "totp");
    const keys = authenticators.filter((a) => a.type === "webauthn");
    const recovery = authenticators.find((a) => a.type === "recovery_codes");
    const factors = keys.length + (totp ? 1 : 0);

    return (
        <>
            {factors === 1 && (
                <Alert variant="warning">
                    You have one second factor. Add another one or save your recovery codes, so you
                    can still log in if you lose it.
                </Alert>
            )}
            <SecurityKeys keys={keys} reload={reload} withReauth={withReauth} />
            <AuthenticatorApp active={totp} reload={reload} withReauth={withReauth} />
            <RecoveryCodes summary={recovery} withReauth={withReauth} />
            {dialog}
        </>
    );
}

export default SecuritySettings;
