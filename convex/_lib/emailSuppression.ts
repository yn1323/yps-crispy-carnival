import type { QueryCtx } from "../_generated/server";
import { normalizeEmail } from "./validation";

export type EmailSuppression = {
  /** 管理画面に表示する配信停止の理由。未入力または空白だけならnull。 */
  reason: string | null;
};

/** 配信停止に登録された宛先ならその登録内容を返す。メール送信の可否判定と、管理画面の表示で同じ判定を使う。 */
export async function getEmailSuppression(ctx: Pick<QueryCtx, "db">, email: string): Promise<EmailSuppression | null> {
  const emailNormalized = normalizeEmail(email);
  if (emailNormalized === "") return null;
  const suppression = await ctx.db
    .query("emailSuppressions")
    .withIndex("by_emailNormalized", (q) => q.eq("emailNormalized", emailNormalized))
    .first();
  if (!suppression) return null;
  return { reason: suppression.reason?.trim() || null };
}

export async function isEmailSuppressed(ctx: Pick<QueryCtx, "db">, email: string): Promise<boolean> {
  return (await getEmailSuppression(ctx, email)) !== null;
}
