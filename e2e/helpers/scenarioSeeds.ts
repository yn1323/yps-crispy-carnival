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
  sub?: string;
};

let cachedOwnerId: string | null = null;

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getE2EOwnerId() {
  if (cachedOwnerId) return cachedOwnerId;

  const storagePath = join(process.cwd(), "e2e", ".clerk", "user.json");
  const state = JSON.parse(readFileSync(storagePath, "utf-8")) as ClerkStorageState;
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
  if (!decoded.sub) {
    throw new Error("Clerk session JWT does not include sub");
  }

  cachedOwnerId = decoded.sub;
  return cachedOwnerId;
}

export function seedOwnerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  return convexRunJson<T>(fn, { ownerId: getE2EOwnerId(), ownerEmail: process.env.E2E_CLERK_USER, ...args });
}
