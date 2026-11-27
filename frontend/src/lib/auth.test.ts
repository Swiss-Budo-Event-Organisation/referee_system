import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { clearTokens, getUser, removeLegacyTokens, setTokens, validToken } from "./auth";
import { REFRESH_TOKEN } from "./constants";
import { makeToken } from "../test/utils";

const REFRESH_URL = expect.stringMatching(/\/_allauth\/app\/v1\/tokens\/refresh$/);

function refreshed(access: string, refresh = "next-refresh") {
  return { status: 200, data: { status: 200, data: { access_token: access, refresh_token: refresh } } };
}

describe("auth", () => {
  it("reads the user id from a token", () => {
    expect(getUser(makeToken(7))).toBe(7);
    expect(getUser()).toBeUndefined();
    setTokens(makeToken(9), makeToken(9, 86400, "refresh"));
    expect(getUser()).toBe(9);
  });

  it("knows the user from the refresh token after a reload", () => {
    sessionStorage.setItem(REFRESH_TOKEN, makeToken(9, 86400, "refresh"));
    expect(getUser()).toBe(9);
  });

  it("forgets the user once the refresh token has expired", () => {
    sessionStorage.setItem(REFRESH_TOKEN, makeToken(9, -10, "refresh"));
    expect(getUser()).toBeUndefined();
  });

  it("keeps the access token out of web storage", () => {
    const access = makeToken(7);
    setTokens(access, "refresh-token");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(access);
    expect(sessionStorage.getItem(REFRESH_TOKEN)).toBe("refresh-token");
  });

  it("returns a valid access token", async () => {
    const token = makeToken(7);
    setTokens(token);
    expect(await validToken()).toBe(token);
  });

  it("refreshes a token about to expire and stores the rotated refresh token", async () => {
    setTokens(makeToken(7, 10), "refresh-token");
    const fresh = makeToken(7);
    const post = vi.spyOn(axios, "post").mockResolvedValue(refreshed(fresh));
    expect(await validToken()).toBe(fresh);
    expect(post).toHaveBeenCalledWith(REFRESH_URL, { refresh_token: "refresh-token" });
    expect(sessionStorage.getItem(REFRESH_TOKEN)).toBe("next-refresh");
  });

  it("refreshes only once for parallel requests", async () => {
    sessionStorage.setItem(REFRESH_TOKEN, "refresh-token");
    const fresh = makeToken(7);
    const post = vi.spyOn(axios, "post").mockResolvedValue(refreshed(fresh));
    const tokens = await Promise.all([validToken(), validToken(), validToken()]);
    expect(tokens).toEqual([fresh, fresh, fresh]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("logs out when the refresh token is rejected", async () => {
    sessionStorage.setItem(REFRESH_TOKEN, "revoked");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("401"));
    expect(await validToken()).toBeNull();
    expect(sessionStorage.getItem(REFRESH_TOKEN)).toBeNull();
  });

  it("removes the tokens of the former login from localStorage", () => {
    localStorage.setItem("access", "old");
    localStorage.setItem("refresh", "old");
    localStorage.setItem("theme", "dark");
    removeLegacyTokens();
    expect(Object.keys(localStorage)).toEqual(["theme"]);
  });

  it("returns null without any token", async () => {
    const post = vi.spyOn(axios, "post");
    clearTokens();
    expect(await validToken()).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
