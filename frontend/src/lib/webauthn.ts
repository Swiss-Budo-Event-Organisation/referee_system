/**
 * Passkeys and security keys. allauth sends the WebAuthn options as JSON
 * ({ publicKey: {...} } with base64url values), which the browser parses
 * natively, and takes the credential back as JSON.
 */

type JSONOptions = { publicKey: Record<string, unknown> };

// Not yet in TypeScript's DOM types.
type PublicKeyCredentialJSONStatics = {
    parseCreationOptionsFromJSON(options: unknown): PublicKeyCredentialCreationOptions;
    parseRequestOptionsFromJSON(options: unknown): PublicKeyCredentialRequestOptions;
    isConditionalMediationAvailable?: () => Promise<boolean>;
};

function statics(): PublicKeyCredentialJSONStatics | undefined {
    if (typeof window === "undefined" || !("PublicKeyCredential" in window)) return;
    return window.PublicKeyCredential as unknown as PublicKeyCredentialJSONStatics;
}

export function webauthnSupported(): boolean {
    const pkc = statics();
    return (
        typeof pkc?.parseRequestOptionsFromJSON === "function" &&
        typeof pkc?.parseCreationOptionsFromJSON === "function"
    );
}

/** Whether the browser offers passkeys in the username field's autofill. */
export async function autofillSupported(): Promise<boolean> {
    const pkc = statics();
    if (!webauthnSupported() || !pkc?.isConditionalMediationAvailable) return false;
    return pkc.isConditionalMediationAvailable();
}

function toJSON(credential: Credential | null): unknown {
    if (!credential) throw new Error("No passkey was chosen.");
    return (credential as PublicKeyCredential).toJSON();
}

export async function getCredential(
    options: JSONOptions,
    extra: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {},
): Promise<unknown> {
    const publicKey = statics()!.parseRequestOptionsFromJSON(options.publicKey);
    return toJSON(await navigator.credentials.get({ publicKey, ...extra }));
}

export async function createCredential(options: JSONOptions): Promise<unknown> {
    const publicKey = statics()!.parseCreationOptionsFromJSON(options.publicKey);
    return toJSON(await navigator.credentials.create({ publicKey }));
}
