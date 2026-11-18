import type { QueryCtx } from "../_generated/server";
import { normalizeEmail } from "./validation";

/** 配信停止に登録された宛先かを返す。メール送信の可否判定と、管理画面のラベル表示で同じ判定を使う。 */
export async function isEmailSuppressed(ctx: Pick<QueryCtx, "db">, email: string): Promise<boolean> {
  const emailNormalized = normalizeEmail(email);
  if (emailNormalized === "") return false;
  const suppression = await ctx.db
    .query("emailSuppressions")
    .withIndex("by_emailNormalized", (q) => q.eq("emailNormalized", emailNormalized))
    .first();
  return suppression !== null;
}
