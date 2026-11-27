/**
 * django-allauth's headless "app" client: login, second factors,
 * reauthentication and managing the factors.
 *
 * During login allauth identifies the attempt by a session token, sent back
 * as X-Session-Token. Once the user is fully authenticated the response
 * carries the access and refresh token, which lib/auth.ts keeps. Further
 * calls authenticate with the access token.
 *
 * Every function resolves with allauth's response body, also for 4xx
 * answers: a 401 is how allauth asks for the next step (see pendingFlow
 * and needsReauthentication).
 */
import axios from "axios";
import { ALLAUTH_URL, clearTokens, setTokens, validToken } from "./auth";
import { getCredential } from "./webauthn";

export type Flow = { id: string; is_pending?: boolean; types?: string[] };

export type AllauthError = { message: string; code: string; param?: string };

/** The data of a response; its shape depends on the endpoint. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;

export type AllauthResponse<T = Data> = {
    status: number;
    data?: T;
    meta?: {
        is_authenticated?: boolean;
        session_token?: string;
        access_token?: string;
        refresh_token?: string;
        [key: string]: unknown;
    };
    errors?: AllauthError[];
};

export type Authenticator = {
    id?: number;
    type: "totp" | "recovery_codes" | "webauthn";
    name?: string;
    is_passwordless?: boolean;
    created_at: number;
    last_used_at: number | null;
    total_code_count?: number;
    unused_code_count?: number;
    unused_codes?: string[];
};

const client = axios.create({ baseURL: ALLAUTH_URL, validateStatus: () => true });

let sessionToken: string | null = null;

type Options = { authenticated?: boolean };

async function call<T = Data>(
    method: "get" | "post" | "put" | "delete",
    path: string,
    data?: unknown,
    { authenticated = true }: Options = {},
): Promise<AllauthResponse<T>> {
    const headers: Record<string, string> = {};
    if (authenticated) {
        const token = await validToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (sessionToken) headers["X-Session-Token"] = sessionToken;
    const res = await client.request({ method, url: path, data, headers });
    const body: AllauthResponse<T> =
        res.data && typeof res.data === "object" ? res.data : { status: res.status };
    const meta = body.meta;
    if (meta?.access_token) {
        setTokens(meta.access_token, meta.refresh_token);
        sessionToken = null;
    } else if (meta?.session_token) {
        sessionToken = meta.session_token;
    }
    return body;
}

/** The step allauth waits for, e.g. "mfa_authenticate". */
export function pendingFlow(res: AllauthResponse): Flow | undefined {
    return res.data?.flows?.find((flow: Flow) => flow.is_pending);
}

/** The ways to confirm a sensitive change, when allauth asks for one. */
export function needsReauthentication(res: AllauthResponse): Flow[] | null {
    if (res.status !== 401 || !res.meta?.is_authenticated) return null;
    const flows: Flow[] = (res.data?.flows ?? []).filter((flow: Flow) =>
        ["reauthenticate", "mfa_reauthenticate"].includes(flow.id),
    );
    return flows.length ? flows : null;
}

export function isLoggedIn(res: AllauthResponse): boolean {
    return res.status === 200 && Boolean(res.meta?.access_token);
}

export function errorMessage(res: AllauthResponse, fallback = "That did not work."): string {
    return res.errors?.map((error) => error.message).join(" ") || fallback;
}

// Login -----------------------------------------------------------------------

export async function login(username: string, password: string) {
    sessionToken = null;
    clearTokens();
    return call("post", "/auth/login", { username, password }, { authenticated: false });
}

/** The second factor: an authenticator app code or a recovery code. */
export async function mfaAuthenticate(code: string) {
    return call("post", "/auth/2fa/authenticate", { code }, { authenticated: false });
}

/** The second factor with a passkey or security key. */
export async function mfaAuthenticateWebAuthn() {
    const options = await call("get", "/auth/webauthn/authenticate", undefined, {
        authenticated: false,
    });
    const credential = await getCredential(options.data.request_options);
    return call("post", "/auth/webauthn/authenticate", { credential }, { authenticated: false });
}

/**
 * Log in with a passkey alone. With mediation "conditional" the browser
 * offers the passkeys in the username field's autofill.
 */
export async function passkeyLogin(
    extra: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {},
) {
    sessionToken = null;
    const options = await call("get", "/auth/webauthn/login", undefined, { authenticated: false });
    const credential = await getCredential(options.data.request_options, extra);
    return call("post", "/auth/webauthn/login", { credential }, { authenticated: false });
}

/** Ends the session on the server, which revokes the tokens. */
export async function logout() {
    try {
        await call("delete", "/auth/session");
    } finally {
        sessionToken = null;
        clearTokens();
    }
}

// Reauthentication --------------------------------------------------------------

export async function reauthenticate(password: string) {
    return call("post", "/auth/reauthenticate", { password });
}

export async function mfaReauthenticate(code: string) {
    return call("post", "/auth/2fa/reauthenticate", { code });
}

export async function webauthnReauthenticate() {
    const options = await call("get", "/auth/webauthn/reauthenticate");
    const credential = await getCredential(options.data.request_options);
    return call("post", "/auth/webauthn/reauthenticate", { credential });
}

// Password ------------------------------------------------------------------------

/**
 * Logs out every other device. This one stays logged in: the response
 * carries new tokens, which call() keeps.
 */
export async function changePassword(currentPassword: string, newPassword: string) {
    return call("post", "/account/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
    });
}

// Managing the factors ------------------------------------------------------------

export async function getAuthenticators() {
    return call<Authenticator[]>("get", "/account/authenticators");
}

/** 404 with meta.secret and meta.totp_url while no app is set up. */
export async function getTOTP() {
    return call<Authenticator>("get", "/account/authenticators/totp");
}

export async function activateTOTP(code: string) {
    return call<Authenticator>("post", "/account/authenticators/totp", { code });
}

export async function deactivateTOTP() {
    return call("delete", "/account/authenticators/totp");
}

export async function getRecoveryCodes() {
    return call<Authenticator>("get", "/account/authenticators/recovery-codes");
}

export async function regenerateRecoveryCodes() {
    return call<Authenticator>("post", "/account/authenticators/recovery-codes");
}

export async function getWebAuthnCreationOptions(passwordless: boolean) {
    const query = passwordless ? "?passwordless" : "";
    return call("get", `/account/authenticators/webauthn${query}`);
}

export async function addWebAuthn(name: string, credential: unknown) {
    return call<Authenticator>("post", "/account/authenticators/webauthn", { name, credential });
}

export async function renameWebAuthn(id: number, name: string) {
    return call<Authenticator>("put", "/account/authenticators/webauthn", { id, name });
}

export async function deleteWebAuthn(ids: number[]) {
    return call("delete", "/account/authenticators/webauthn", { authenticators: ids });
}
