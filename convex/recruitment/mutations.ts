/**
 * 募集ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - シフト募集の作成
 * - シフト募集の締め切り
 * - シフト募集の確定（メール通知付き）
 */
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { RECRUITMENT_STATUS } from "../constants";
import { generateToken, requireShop, requireShopOwnerOrManager } from "../helpers";

// 日付形式バリデーション（YYYY-MM-DD形式）
const isValidDateFormat = (date: string) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime());
};

// シフト募集作成
export const create = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    deadline: v.string(),
  },
  handler: async (ctx, args) => {
    // 店舗存在チェック
    await requireShop(ctx, args.shopId);

    // 権限チェック（オーナーまたはマネージャーのみ）
    await requireShopOwnerOrManager(ctx, args.shopId, args.authId);

    // 日付形式バリデーション
    if (!isValidDateFormat(args.startDate)) {
      throw new ConvexError({ message: "開始日の形式が不正です", code: "INVALID_START_DATE" });
    }
    if (!isValidDateFormat(args.endDate)) {
      throw new ConvexError({ message: "終了日の形式が不正です", code: "INVALID_END_DATE" });
    }
    if (!isValidDateFormat(args.deadline)) {
      throw new ConvexError({ message: "締切日の形式が不正です", code: "INVALID_DEADLINE" });
    }

    // ビジネスルールバリデーション（フロントエンドのzodスキーマと一致）
    if (args.startDate > args.endDate) {
      throw new ConvexError({ message: "終了日は開始日以降を指定してください", code: "END_BEFORE_START" });
    }
    if (args.deadline >= args.startDate) {
      throw new ConvexError({
        message: "締切日は開始日より前を指定してください",
        code: "DEADLINE_NOT_BEFORE_START",
      });
    }

    // アクティブスタッフ数を取得（非削除かつ非退職）
    const activeStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("status"), "resigned")))
      .collect();

    const totalStaffCount = activeStaffs.length;

    // 募集作成
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: args.shopId,
      startDate: args.startDate,
      endDate: args.endDate,
      deadline: args.deadline,
      status: RECRUITMENT_STATUS[0], // "open"
      appliedCount: 0,
      totalStaffCount,
      createdBy: args.authId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    // 各スタッフにマジックリンクトークンを生成（募集単位）
    const deadlineEnd = new Date(`${args.deadline}T23:59:59`).getTime();
    const recipients: { email: string; magicLinkToken: string }[] = [];

    for (const staff of activeStaffs) {
      const token = generateToken();
      await ctx.db.insert("magicLinks", {
        staffId: staff._id,
        recruitmentId,
        token,
        expiresAt: deadlineEnd,
      });
      recipients.push({ email: staff.email, magicLinkToken: token });
    }

    // 店舗情報を取得してメール送信をスケジュール
    const shop = await requireShop(ctx, args.shopId);
    if (recipients.length > 0) {
      await ctx.scheduler.runAfter(0, internal.email.actions.sendRecruitmentNotification, {
        shopName: shop.shopName,
        startDate: args.startDate,
        endDate: args.endDate,
        deadline: args.deadline,
        recipients,
      });
    }

    return { success: true, data: { recruitmentId, totalStaffCount } };
  },
});

// シフト募集の締め切り
export const close = mutation({
  args: {
    recruitmentId: v.id("recruitments"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted) {
      throw new ConvexError({ message: "募集が見つかりません", code: "RECRUITMENT_NOT_FOUND" });
    }

    // 権限チェック
    await requireShopOwnerOrManager(ctx, recruitment.shopId, args.authId);

    // ステータスチェック（openのみ締め切り可能）
    if (recruitment.status !== RECRUITMENT_STATUS[0]) {
      throw new ConvexError({ message: "この募集は締め切り済みです", code: "ALREADY_CLOSED" });
    }

    await ctx.db.patch(args.recruitmentId, {
      status: RECRUITMENT_STATUS[1], // "closed"
    });

    return { success: true };
  },
});

// シフト募集の確定（確定通知メール送信）
export const confirm = mutation({
  args: {
    recruitmentId: v.id("recruitments"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted) {
      throw new ConvexError({ message: "募集が見つかりません", code: "RECRUITMENT_NOT_FOUND" });
    }

    // 権限チェック
    await requireShopOwnerOrManager(ctx, recruitment.shopId, args.authId);

    // ステータスチェック（closedのみ確定可能）
    if (recruitment.status !== RECRUITMENT_STATUS[1]) {
      throw new ConvexError({ message: "締め切り後に確定してください", code: "NOT_CLOSED" });
    }

    await ctx.db.patch(args.recruitmentId, {
      status: RECRUITMENT_STATUS[2], // "confirmed"
      confirmedAt: Date.now(),
    });

    // 確定通知メール送信
    const shop = await requireShop(ctx, recruitment.shopId);
    const magicLinksForRecruitment = await ctx.db
      .query("magicLinks")
      .withIndex("by_recruitment", (q) => q.eq("recruitmentId", args.recruitmentId))
      .collect();

    const recipients: { email: string; magicLinkToken: string }[] = [];
    for (const ml of magicLinksForRecruitment) {
      const staff = await ctx.db.get(ml.staffId);
      if (staff && !staff.isDeleted && staff.status !== "resigned") {
        recipients.push({ email: staff.email, magicLinkToken: ml.token });
      }
    }

    if (recipients.length > 0) {
      await ctx.scheduler.runAfter(0, internal.email.actions.sendShiftConfirmationNotification, {
        shopName: shop.shopName,
        startDate: recruitment.startDate,
        endDate: recruitment.endDate,
        recipients,
      });
    }

    return { success: true };
  },
});
