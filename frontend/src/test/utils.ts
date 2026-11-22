function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** An unsigned JWT; jwt-decode does not verify signatures. */
export function makeToken(userId: number, expiresInSeconds = 1800): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ user_id: userId, exp, token_type: "access" }),
    "signature",
  ].join(".");
}
