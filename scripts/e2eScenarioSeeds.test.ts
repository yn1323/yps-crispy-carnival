import { describe, expect, it } from "vitest";
import { getE2EManagerAuthTokenIdentifierFromStorageState } from "../e2e/helpers/scenarioSeeds";

function createSessionCookie(payload: Record<string, unknown>, domain = "localhost") {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    name: "__session",
    value: `header.${encodedPayload}.signature`,
    domain,
  };
}

describe("E2E manager session identity", () => {
  it("fresh contextのClerk session cookieからConvex identityを導く", () => {
    const state = {
      cookies: [createSessionCookie({ iss: "https://clerk.example.test", sub: "user_reserved_4" }, ".example.test")],
    };

    expect(getE2EManagerAuthTokenIdentifierFromStorageState(state)).toBe("https://clerk.example.test|user_reserved_4");
  });

  it.each([
    ["session cookieなし", { cookies: [] }],
    ["JWT payload不正", { cookies: [{ name: "__session", value: "not-a-jwt", domain: "localhost" }] }],
    ["必須claimなし", { cookies: [createSessionCookie({ iss: "https://clerk.example.test" })] }],
  ])("%sではcookie値を含まない一定のerrorにする", (_label, state) => {
    expect(() => getE2EManagerAuthTokenIdentifierFromStorageState(state)).toThrow(
      "Clerk session identity could not be derived for the E2E actor",
    );
  });
});
