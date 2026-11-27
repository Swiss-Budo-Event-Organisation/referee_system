import { setTokens } from "../lib/auth";

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** An unsigned JWT like allauth's; jwt-decode does not verify signatures. */
export function makeToken(userId: number, expiresInSeconds = 300, use = "access"): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: String(userId), exp, token_use: use }),
    "signature",
  ].join(".");
}

/** Log in as the given user, as if allauth had handed out the tokens. */
export function logInAs(userId: number) {
  setTokens(makeToken(userId), makeToken(userId, 86400, "refresh"));
}
