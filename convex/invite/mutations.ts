/**
 * 招待ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - マネージャー招待の作成・キャンセル・再送
 * - 招待の受け入れ処理
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { INVITE_EXPIRY_MS, STAFF_ROLES } from "../constants";
import {
  generateToken,
  getStaff,
  getStaffByEmail,
  getStaffByInviteToken,
  getUserByAuthId,
  requireShop,
} from "../helpers";

// 招待作成
export const create = mutation({
  args: {
    shopId: v.id("shops"),
    displayName: v.string(),
    email: v.string(),
    role: v.string(), // "owner" | "manager" | "general"
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const shop = await requireShop(ctx, args.shopId);

    const trimmedDisplayName = args.displayName.trim();
    const trimmedEmail = args.email.trim().toLowerCase();

    if (!trimmedDisplayName) {
      throw new ConvexError({ message: "表示名は必須です", code: "EMPTY_DISPLAY_NAME" });
    }

    if (!trimmedEmail) {
      throw new ConvexError({ message: "メールアドレスは必須です", code: "EMPTY_EMAIL" });
    }

    if (!STAFF_ROLES.includes(args.role as (typeof STAFF_ROLES)[number])) {
      throw new ConvexError({ message: "無効なロールです", code: "INVALID_ROLE" });
    }

    // 重複メールチェック
    const existingStaff = await getStaffByEmail(ctx, args.shopId, trimmedEmail);
    if (existingStaff && existingStaff.status === "active") {
      throw new ConvexError({
        message: "このメールアドレスは既に登録されています",
        code: "EMAIL_ALREADY_EXISTS",
      });
    }
    if (existingStaff && existingStaff.status === "pending") {
      throw new ConvexError({
        message: "このメールアドレスは既に招待中です",
        code: "EMAIL_ALREADY_INVITED",
      });
    }

    // トークン生成
    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    // スタッフレコード作成（招待状態）
    const staffId = await ctx.db.insert("staffs", {
      shopId: args.shopId,
      email: trimmedEmail,
      displayName: trimmedDisplayName,
      status: "pending",
      role: args.role,
      inviteToken: token,
      inviteExpiresAt: expiresAt,
      invitedBy: args.authId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return {
      success: true,
      data: {
        staffId,
        token,
        expiresAt,
        shopName: shop.shopName,
      },
    };
  },
});

// 招待受け入れ
export const accept = mutation({
  args: {
    token: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedToken = args.token.trim();

    if (!trimmedToken) {
      throw new ConvexError({ message: "無効なリンクです", code: "INVALID_TOKEN" });
    }

    // トークンでスタッフを検索
    const staff = await getStaffByInviteToken(ctx, trimmedToken);

    if (!staff) {
      throw new ConvexError({ message: "招待が見つかりません", code: "INVITATION_NOT_FOUND" });
    }

    // 有効期限チェック
    if (staff.inviteExpiresAt && staff.inviteExpiresAt < Date.now()) {
      throw new ConvexError({ message: "招待の有効期限が切れています", code: "INVITATION_EXPIRED" });
    }

    // 既に受け入れ済みかチェック
    if (staff.status === "active") {
      throw new ConvexError({ message: "この招待は既に承認済みです", code: "INVITATION_ALREADY_ACCEPTED" });
    }

    // キャンセル済みかチェック
    if (staff.isDeleted) {
      throw new ConvexError({ message: "この招待はキャンセルされました", code: "INVITATION_CANCELLED" });
    }

    // ユーザー情報を取得（存在しない場合は招待情報で自動作成）
    let user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      const userId = await ctx.db.insert("users", {
        name: staff.displayName,
        email: staff.email,
        authId: args.authId,
        status: "active",
        createdAt: Date.now(),
        isDeleted: false,
      });
      const newUser = await ctx.db.get(userId);
      if (!newUser) {
        throw new ConvexError({ message: "ユーザーの作成に失敗しました", code: "USER_CREATION_FAILED" });
      }
      user = newUser;
    }

    // 店舗情報を取得
    const shop = await ctx.db.get(staff.shopId);

    if (!shop || shop.isDeleted) {
      throw new ConvexError({ message: "店舗が見つかりません", code: "SHOP_NOT_FOUND" });
    }

    // スタッフ情報を更新（招待受け入れ）
    await ctx.db.patch(staff._id, {
      userId: user._id,
      email: user.email,
      status: "active",
      inviteToken: undefined, // トークンをクリア
      inviteExpiresAt: undefined,
    });

    return {
      success: true,
      data: {
        shopId: staff.shopId,
        shopName: shop.shopName,
      },
    };
  },
});

// 招待キャンセル
export const cancel = mutation({
  args: {
    staffId: v.id("staffs"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await getStaff(ctx, args.staffId);

    if (!staff) {
      throw new ConvexError({ message: "招待が見つかりません", code: "INVITATION_NOT_FOUND" });
    }

    // pending状態のみキャンセル可能
    if (staff.status !== "pending") {
      throw new ConvexError({ message: "この招待はキャンセルできません", code: "CANNOT_CANCEL" });
    }

    // 論理削除
    await ctx.db.patch(args.staffId, {
      isDeleted: true,
      inviteToken: undefined,
      inviteExpiresAt: undefined,
    });

    return { success: true };
  },
});

// 招待再送（トークン再生成）
export const resend = mutation({
  args: {
    staffId: v.id("staffs"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await getStaff(ctx, args.staffId);

    if (!staff) {
      throw new ConvexError({ message: "招待が見つかりません", code: "INVITATION_NOT_FOUND" });
    }

    const shop = await requireShop(ctx, staff.shopId);

    // pending状態のみ再送可能
    if (staff.status !== "pending") {
      throw new ConvexError({ message: "この招待は再送できません", code: "CANNOT_RESEND" });
    }

    // 新しいトークン生成
    const token = generateToken();
    const expiresAt = Date.now() + INVITE_EXPIRY_MS;

    await ctx.db.patch(args.staffId, {
      inviteToken: token,
      inviteExpiresAt: expiresAt,
    });

    return {
      success: true,
      data: {
        token,
        expiresAt,
        shopName: shop.shopName,
      },
    };
  },
});
