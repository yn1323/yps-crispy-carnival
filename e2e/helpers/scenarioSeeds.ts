import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexRunJson } from "./convex";

type ClerkStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
};

type ClerkSessionPayload = {
  iss?: string;
  sub?: string;
};

let cachedOwnerAuthTokenIdentifier: string | null = null;

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getE2EOwnerAuthTokenIdentifier() {
  if (cachedOwnerAuthTokenIdentifier) return cachedOwnerAuthTokenIdentifier;

  const storagePath = join(process.cwd(), "e2e", ".clerk", "user.json");
  const state = JSON.parse(readFileSync(storagePath, "utf-8")) as ClerkStorageState;
  // Clerk の cookie 名・domain はローカル/CIで揺れることがある。
  // Convex の認証キーは issuer|subject なので、保存済み storageState からJWTを読む。
  const sessionCookie =
    state.cookies.find((cookie) => cookie.name === "__session" && cookie.domain === "localhost") ??
    state.cookies.find((cookie) => cookie.name.startsWith("__session"));

  if (!sessionCookie) {
    throw new Error(`Clerk session cookie was not found in ${storagePath}`);
  }

  const [, payload] = sessionCookie.value.split(".");
  if (!payload) {
    throw new Error("Clerk session cookie is not a JWT");
  }

  const decoded = JSON.parse(decodeBase64Url(payload)) as ClerkSessionPayload;
  if (!decoded.iss || !decoded.sub) {
    throw new Error("Clerk session JWT does not include iss/sub");
  }

  cachedOwnerAuthTokenIdentifier = `${decoded.iss}|${decoded.sub}`;
  return cachedOwnerAuthTokenIdentifier;
}

export function seedOwnerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  // dry-run 判定は ownerEmail 経由で行うため、seed でも本番コードと同じ owner 情報を渡す。
  return convexRunJson<T>(fn, {
    ownerAuthTokenIdentifier: getE2EOwnerAuthTokenIdentifier(),
    ownerEmail: process.env.E2E_CLERK_USER,
    ...args,
  });
}
