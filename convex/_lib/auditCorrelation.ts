import { ConvexError } from "convex/values";

const REQUEST_ID_MIN_LENGTH = 8;
const REQUEST_ID_MAX_LENGTH = 100;

/** クライアント入力を監査へ直接保存せず、冪等照合用の固定長キーへ変換する。 */
export async function toAuditRequestKey(requestId: string): Promise<string> {
  const value = requestId.trim();
  if (value.length < REQUEST_ID_MIN_LENGTH || value.length > REQUEST_ID_MAX_LENGTH) {
    throw new ConvexError("入力内容を確認してください");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
