import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexRunJson } from "./convex";
import { getCurrentE2EClerkUser, getE2EStorageStatePath } from "./e2eUsers";

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

const cachedOwnerAuthTokenIdentifiers = new Map<number, string>();

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getE2EOwnerAuthTokenIdentifier(userIndex = getCurrentE2EClerkUser().index) {
  const cached = cachedOwnerAuthTokenIdentifiers.get(userIndex);
  if (cached) return cached;

  const storagePath = join(process.cwd(), getE2EStorageStatePath(userIndex));
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

  const authTokenIdentifier = `${decoded.iss}|${decoded.sub}`;
  cachedOwnerAuthTokenIdentifiers.set(userIndex, authTokenIdentifier);
  return authTokenIdentifier;
}

export function seedOwnerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  const user = getCurrentE2EClerkUser();
  // dry-run 判定は ownerEmail 経由で行うため、seed でも本番コードと同じ owner 情報を渡す。
  return convexRunJson<T>(fn, {
    ownerAuthTokenIdentifier: getE2EOwnerAuthTokenIdentifier(user.index),
    ownerEmail: user.email,
    ...args,
  });
}

export function resetCurrentOwnerScenarioData() {
  return convexRunJson("testing:resetOwnerScenarioData", {
    ownerAuthTokenIdentifier: getE2EOwnerAuthTokenIdentifier(),
  });
}
