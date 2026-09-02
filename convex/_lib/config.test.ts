import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDevelopmentSeedEnabled, getDevelopmentSeedConfiguration } from "./config";

const CLERK_ISSUER = "https://clerk.seed.example.test";
const PRIMARY_AUTH_TOKEN_IDENTIFIER = `${CLERK_ISSUER}|user_seedPrimary`;

describe("development seed guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubReadyEnvironment() {
    vi.stubEnv("DEVELOPMENT_SEED_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud/");
    vi.stubEnv("DEVELOPMENT_SEED_DEPLOYMENT_URL", " https://seed-development.convex.cloud/// ");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", CLERK_ISSUER);
    vi.stubEnv("DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", PRIMARY_AUTH_TOKEN_IDENTIFIER);
  }

  it("enable、deployment一致、dry-runがすべて揃った時だけ許可する", () => {
    stubReadyEnvironment();

    expect(assertDevelopmentSeedEnabled()).toEqual({
      enabled: true,
      currentDeploymentUrl: "https://seed-development.convex.cloud",
      targetDeploymentUrl: "https://seed-development.convex.cloud",
      notificationDeliveryMode: "dry-run",
      primaryAuthTokenIdentifier: PRIMARY_AUTH_TOKEN_IDENTIFIER,
    });
  });

  it.each([
    ["enable未設定", "DEVELOPMENT_SEED_ENABLED", ""],
    ["enableの表記揺れ", "DEVELOPMENT_SEED_ENABLED", "TRUE"],
    ["deployment不一致", "DEVELOPMENT_SEED_DEPLOYMENT_URL", "https://other.convex.cloud"],
    ["delivery mode未設定", "NOTIFICATION_DELIVERY_MODE", ""],
    ["delivery modeが別の抑止mode", "NOTIFICATION_DELIVERY_MODE", "disabled"],
    ["Clerk issuer未設定", "CLERK_JWT_ISSUER_DOMAIN", ""],
    ["主利用者識別子未設定", "DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", ""],
  ])("%sをfail closedにする", (_label, key, value) => {
    stubReadyEnvironment();
    vi.stubEnv(key, value);

    expect(getDevelopmentSeedConfiguration().enabled).toBe(key !== "DEVELOPMENT_SEED_ENABLED");
    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/Development seed/);
  });

  it("dry-runの大文字と前後空白は正規化する", () => {
    stubReadyEnvironment();
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", " DRY-RUN ");

    expect(assertDevelopmentSeedEnabled().notificationDeliveryMode).toBe("dry-run");
  });

  it.each([
    ["区切りなし", "user_seedPrimary"],
    ["Clerk User以外", `${CLERK_ISSUER}|session_seedPrimary`],
    ["issuerのpath付き", `${CLERK_ISSUER}/path|user_seedPrimary`],
  ])("主利用者識別子が%sならfail closedにする", (_label, value) => {
    stubReadyEnvironment();
    vi.stubEnv("DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", value);

    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/primary auth token identifier is invalid/);
  });

  it("主利用者識別子のissuerがClerk設定と異なればfail closedにする", () => {
    stubReadyEnvironment();
    vi.stubEnv(
      "DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER",
      "https://other-clerk.seed.example.test|user_seedPrimary",
    );

    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/issuer does not match/);
  });

  it("Clerk設定の末尾slashと値の前後空白を認証時の完全一致値へ正規化する", () => {
    stubReadyEnvironment();
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", `${CLERK_ISSUER}/`);
    vi.stubEnv("DEVELOPMENT_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", `  ${PRIMARY_AUTH_TOKEN_IDENTIFIER}  `);

    expect(assertDevelopmentSeedEnabled().primaryAuthTokenIdentifier).toBe(PRIMARY_AUTH_TOKEN_IDENTIFIER);
  });
});
