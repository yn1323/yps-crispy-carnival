import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { buildLineCtaSection } from "../notification/templates";
import { buildLineAuthorizeUrl } from "./lineClient";

/**
 * 既存通知メール末尾の「LINEで受け取る」CTA HTML を生成
 * - 未連携 / 友達解除済みのスタッフのみに対して CTA を返す
 * - LINE_LOGIN_CHANNEL_ID 未設定 or 既に連携済み&友達追加中 → 空文字
 */
export async function buildLineCtaForStaff(
  ctx: ActionCtx,
  params: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    lineUserId?: string;
    lineFollowing?: boolean;
    appUrl: string;
  },
): Promise<string> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  if (!channelId) return "";
  if (params.lineUserId && params.lineFollowing) return "";

  const { token } = await ctx.runMutation(internal.line.mutations.createLinkTokenInternal, {
    staffId: params.staffId,
    shopId: params.shopId,
  });
  const authorizeUrl = buildLineAuthorizeUrl({
    channelId,
    redirectUri: `${params.appUrl}/line/callback`,
    state: token,
  });
  return buildLineCtaSection({ authorizeUrl, reLink: Boolean(params.lineUserId) });
}
