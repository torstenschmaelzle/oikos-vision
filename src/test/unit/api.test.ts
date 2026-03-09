import { describe, it, expect, beforeEach } from "vitest";
import { setAccessToken, getAccessToken } from "@/lib/api";

describe("Token management", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it("starts with null token", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("stores and retrieves a token", () => {
    setAccessToken("test-jwt-token");
    expect(getAccessToken()).toBe("test-jwt-token");
  });

  it("clears the token", () => {
    setAccessToken("test-jwt-token");
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
