/**
 * The JWTs django-allauth hands out once a user is fully logged in, i.e.
 * after the second factor.
 *
 * The access token (5 minutes) lives in memory only. The refresh token
 * (24 hours, rotated on every use) is kept in sessionStorage, so it survives
 * reloads in the tab but is gone once the tab is closed.
 */
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { REFRESH_TOKEN } from "./constants";

export const ALLAUTH_URL = `${import.meta.env.VITE_API_URL ?? ""}/_allauth/app/v1`;

/** Seconds before expiry at which an access token is refreshed. */
const EXPIRY_MARGIN = 30;

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

/** The former login (djangorestframework-simplejwt) kept its tokens here. */
export function removeLegacyTokens() {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
}
removeLegacyTokens();

type Claims = { sub?: string; exp?: number };

function decode(token: string): Claims | null {
    try {
        return jwtDecode<Claims>(token);
    } catch {
        return null;
    }
}

function expiresWithin(token: string, seconds: number): boolean {
    const exp = decode(token)?.exp;
    return exp === undefined || exp - seconds < Date.now() / 1000;
}

export function setTokens(access: string, refresh?: string | null) {
    accessToken = access;
    if (refresh) sessionStorage.setItem(REFRESH_TOKEN, refresh);
}

export function clearTokens() {
    accessToken = null;
    refreshing = null;
    sessionStorage.removeItem(REFRESH_TOKEN);
}

/**
 * The id of the logged-in user, from the given token, the access token or
 * else the refresh token. undefined when nobody is logged in.
 */
export function getUser(tk: string | null = null): number | undefined {
    let token = tk;
    if (!token) {
        const refresh = sessionStorage.getItem(REFRESH_TOKEN);
        if (accessToken && !expiresWithin(accessToken, 0)) token = accessToken;
        else if (refresh && !expiresWithin(refresh, 0)) token = refresh;
    }
    if (!token) return;
    const sub = decode(token)?.sub;
    return sub ? Number(sub) : undefined;
}

async function exchangeRefreshToken(): Promise<string | null> {
    const refresh = sessionStorage.getItem(REFRESH_TOKEN);
    if (!refresh) return null;
    try {
        const res = await axios.post(`${ALLAUTH_URL}/tokens/refresh`, { refresh_token: refresh });
        setTokens(res.data.data.access_token, res.data.data.refresh_token);
        return accessToken;
    } catch {
        // Expired, used up or revoked by a logout.
        clearTokens();
        return null;
    }
}

/**
 * Get a new access token. Parallel callers share one request: refresh
 * tokens are rotated, so a second request with the same one would fail.
 */
export function refreshToken(): Promise<string | null> {
    if (!refreshing) {
        const pending = exchangeRefreshToken();
        refreshing = pending;
        pending.finally(() => {
            if (refreshing === pending) refreshing = null;
        });
    }
    return refreshing;
}

/** A current access token, refreshed when needed; null when logged out. */
export async function validToken(): Promise<string | null> {
    if (accessToken && !expiresWithin(accessToken, EXPIRY_MARGIN)) {
        return accessToken;
    }
    return refreshToken();
}
