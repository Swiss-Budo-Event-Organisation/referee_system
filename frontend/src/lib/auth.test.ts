import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { getUser, validToken } from "./auth";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "./constants";
import { makeToken } from "../test/utils";

describe("auth", () => {
  it("reads the user id from a token", () => {
    expect(getUser(makeToken(7))).toBe(7);
    expect(getUser()).toBeUndefined();
    localStorage.setItem(ACCESS_TOKEN, makeToken(9));
    expect(getUser()).toBe(9);
  });

  it("returns a valid stored token", async () => {
    const token = makeToken(7);
    localStorage.setItem(ACCESS_TOKEN, token);
    expect(await validToken()).toBe(token);
  });

  it("refreshes when no access token is stored", async () => {
    const fresh = makeToken(7);
    localStorage.setItem(REFRESH_TOKEN, "refresh-token");
    const post = vi.spyOn(axios, "post").mockResolvedValue({ status: 200, data: { access: fresh } });
    expect(await validToken()).toBe(fresh);
    expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/api\/token\/refresh\/$/), {
      refresh: "refresh-token",
    });
    expect(localStorage.getItem(ACCESS_TOKEN)).toBe(fresh);
  });

  it("returns null without any token", async () => {
    const post = vi.spyOn(axios, "post");
    expect(await validToken()).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
