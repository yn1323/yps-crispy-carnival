import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "./lineSignature";

const SECRET = "test-channel-secret";
const BODY = JSON.stringify({ destination: "U", events: [] });

/**
 * リファレンス実装で署名を生成（Web Crypto）
 */
async function signWith(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let bin = "";
  for (let i = 0; i < sig.length; i++) bin += String.fromCharCode(sig[i]);
  return btoa(bin);
}

describe("verifyLineSignature", () => {
  it("正しい署名は通る", async () => {
    const sig = await signWith(SECRET, BODY);
    expect(await verifyLineSignature(SECRET, BODY, sig)).toBe(true);
  });

  it("署名がないと false", async () => {
    expect(await verifyLineSignature(SECRET, BODY, null)).toBe(false);
  });

  it("署名が違うと false", async () => {
    const wrong = await signWith("other-secret", BODY);
    expect(await verifyLineSignature(SECRET, BODY, wrong)).toBe(false);
  });

  it("body が改竄されていると false", async () => {
    const sig = await signWith(SECRET, BODY);
    expect(await verifyLineSignature(SECRET, `${BODY}x`, sig)).toBe(false);
  });

  it("長さが違う署名でも例外を投げず false", async () => {
    expect(await verifyLineSignature(SECRET, BODY, "short")).toBe(false);
  });
});
