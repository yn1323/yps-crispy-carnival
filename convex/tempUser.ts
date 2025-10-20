import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

// トークン生成ヘルパー（簡易版）
const generateToken = () => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// 30日後のタイムスタンプを取得
const getExpiresAt = () => {
  return Date.now() + 30 * 24 * 60 * 60 * 1000; // 30日
};

// 1. 仮登録ユーザー作成 + 招待トークン生成
export const createTempUserWithInvite = mutation({
  args: {
    shopId: v.string(),
    userName: v.string(),
    role: v.string(), // "manager" | "staff"
    authId: v.string(), // 作成者
    email: v.string(), // メール送信用（DB保存しない）
  },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;
      const trimmedUserName = args.userName.trim();
      const trimmedEmail = args.email.trim();

      // バリデーション: ユーザー名
      if (!trimmedUserName) {
        throw new ConvexError({
          message: "ユーザー名は必須です",
          code: "EMPTY_USER_NAME",
        });
      }

      // バリデーション: メールアドレス
      if (!trimmedEmail) {
        throw new ConvexError({
          message: "メールアドレスは必須です",
          code: "EMPTY_EMAIL",
        });
      }

      // バリデーション: role
      if (args.role !== "manager" && args.role !== "staff") {
        throw new ConvexError({
          message: "ロールはmanagerまたはstaffのみ指定可能です",
          code: "INVALID_ROLE",
        });
      }

      // 店舗存在チェック
      const shop = await ctx.db.get(shopId);
      if (!shop || shop.isDeleted) {
        throw new ConvexError({
          message: "店舗が見つかりません",
          code: "SHOP_NOT_FOUND",
        });
      }

      // 作成者のauthIdからuserIdを取得
      const creator = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!creator) {
        throw new ConvexError({
          message: "作成者が見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", shopId).eq("userId", creator._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || (belonging.role !== "owner" && belonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません",
          code: "PERMISSION_DENIED",
        });
      }

      // 仮登録ユーザー作成（authIdなし、isActivated=false）
      const tempUserId = await ctx.db
        .insert("users", {
          name: trimmedUserName,
          authId: undefined,
          createdAt: Date.now(),
          isDeleted: false,
          isActivated: false,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `仮登録ユーザーの作成に失敗しました: ${e}`,
            code: "CREATE_FAILED",
          });
        });

      // shopUserBelongingsに仮紐付け
      await ctx.db
        .insert("shopUserBelongings", {
          shopId,
          userId: tempUserId,
          role: args.role,
          createdAt: Date.now(),
          isDeleted: false,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `店舗への紐付けに失敗しました: ${e}`,
            code: "BELONGING_FAILED",
          });
        });

      // 招待トークン生成
      const token = generateToken();
      const expiresAt = getExpiresAt();

      await ctx.db
        .insert("inviteTokens", {
          token,
          shopId,
          tempUserId,
          role: args.role,
          status: "active",
          createdAt: Date.now(),
          expiresAt,
          createdBy: args.authId,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `招待トークンの生成に失敗しました: ${e}`,
            code: "TOKEN_CREATE_FAILED",
          });
        });

      // TODO: メール送信処理（外部ツールを使用）
      // 送信内容: trimmedEmail, token, shop.shopName, trimmedUserName
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${token}`;
      console.log(`[TODO] メール送信先: ${trimmedEmail}, 招待URL: ${inviteUrl}`);

      return {
        success: true,
        data: {
          tempUserId,
          token,
          inviteUrl,
        },
      };
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// 2. 招待再送（前のトークンcancelled化）
export const resendInvite = mutation({
  args: {
    tempUserId: v.string(),
    authId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const tempUserId = args.tempUserId as Id<"users">;
      const trimmedEmail = args.email.trim();

      // バリデーション: メールアドレス
      if (!trimmedEmail) {
        throw new ConvexError({
          message: "メールアドレスは必須です",
          code: "EMPTY_EMAIL",
        });
      }

      // 仮登録ユーザー存在チェック
      const tempUser = await ctx.db.get(tempUserId);
      if (!tempUser || tempUser.isDeleted || tempUser.isActivated) {
        throw new ConvexError({
          message: "仮登録ユーザーが見つかりません",
          code: "TEMP_USER_NOT_FOUND",
        });
      }

      // 作成者のauthIdからuserIdを取得
      const creator = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!creator) {
        throw new ConvexError({
          message: "作成者が見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 既存のactiveトークンを取得
      const existingToken = await ctx.db
        .query("inviteTokens")
        .withIndex("by_temp_user", (q) => q.eq("tempUserId", tempUserId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      if (!existingToken) {
        throw new ConvexError({
          message: "有効な招待トークンが見つかりません",
          code: "TOKEN_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", existingToken.shopId).eq("userId", creator._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || (belonging.role !== "owner" && belonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません",
          code: "PERMISSION_DENIED",
        });
      }

      // 既存のトークンをcancelled化
      await ctx.db.patch(existingToken._id, { status: "cancelled" }).catch((e: unknown) => {
        throw new ConvexError({
          message: `トークンのキャンセルに失敗しました: ${e}`,
          code: "TOKEN_CANCEL_FAILED",
        });
      });

      // 新しいトークン生成
      const token = generateToken();
      const expiresAt = getExpiresAt();

      await ctx.db
        .insert("inviteTokens", {
          token,
          shopId: existingToken.shopId,
          tempUserId,
          role: existingToken.role,
          status: "active",
          createdAt: Date.now(),
          expiresAt,
          createdBy: args.authId,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `新しい招待トークンの生成に失敗しました: ${e}`,
            code: "TOKEN_CREATE_FAILED",
          });
        });

      // TODO: メール送信処理（外部ツールを使用）
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${token}`;
      console.log(`[TODO] 再送メール送信先: ${trimmedEmail}, 招待URL: ${inviteUrl}`);

      return {
        success: true,
        data: {
          token,
          inviteUrl,
        },
      };
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// 3. 店舗の仮登録ユーザー一覧取得
export const getTempUsersByShop = query({
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;

      // 店舗に所属するユーザーを取得
      const belongings = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop", (q) => q.eq("shopId", shopId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();

      // 各ユーザー情報を取得（仮登録ユーザーのみ）
      const tempUsers = await Promise.all(
        belongings.map(async (belonging) => {
          const user = await ctx.db.get(belonging.userId);
          if (!user || user.isDeleted || user.isActivated || user.authId) {
            return null;
          }

          // 招待トークン情報も取得
          const inviteToken = await ctx.db
            .query("inviteTokens")
            .withIndex("by_temp_user", (q) => q.eq("tempUserId", user._id))
            .filter((q) => q.eq(q.field("status"), "active"))
            .first();

          return {
            _id: user._id,
            name: user.name,
            role: belonging.role,
            createdAt: belonging.createdAt,
            inviteToken: inviteToken
              ? {
                  token: inviteToken.token,
                  status: inviteToken.status,
                  expiresAt: inviteToken.expiresAt,
                  createdAt: inviteToken.createdAt,
                }
              : null,
          };
        }),
      );

      return tempUsers.filter((user) => user !== null);
    } catch {
      return [];
    }
  },
});

// 4. トークン検証（期限チェック）
export const validateInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      // トークン取得
      const inviteToken = await ctx.db
        .query("inviteTokens")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first();

      if (!inviteToken) {
        return {
          valid: false,
          reason: "TOKEN_NOT_FOUND",
        };
      }

      // ステータスチェック
      if (inviteToken.status !== "active") {
        return {
          valid: false,
          reason: "TOKEN_NOT_ACTIVE",
          status: inviteToken.status,
        };
      }

      // 期限チェック
      if (inviteToken.expiresAt < Date.now()) {
        return {
          valid: false,
          reason: "TOKEN_EXPIRED",
        };
      }

      // 仮登録ユーザー取得
      const tempUser = await ctx.db.get(inviteToken.tempUserId);
      if (!tempUser || tempUser.isDeleted || tempUser.isActivated) {
        return {
          valid: false,
          reason: "TEMP_USER_NOT_FOUND",
        };
      }

      // 店舗情報取得
      const shop = await ctx.db.get(inviteToken.shopId);
      if (!shop || shop.isDeleted) {
        return {
          valid: false,
          reason: "SHOP_NOT_FOUND",
        };
      }

      return {
        valid: true,
        data: {
          tempUserId: tempUser._id,
          tempUserName: tempUser.name,
          shopId: shop._id,
          shopName: shop.shopName,
          role: inviteToken.role,
          expiresAt: inviteToken.expiresAt,
        },
      };
    } catch {
      return {
        valid: false,
        reason: "VALIDATION_ERROR",
      };
    }
  },
});

// 5. トークン使用して本登録
export const activateUserByToken = mutation({
  args: {
    token: v.string(),
    authId: v.string(), // Clerk認証後のauthId
  },
  handler: async (ctx, args) => {
    try {
      // トークン取得
      const inviteToken = await ctx.db
        .query("inviteTokens")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first();

      if (!inviteToken) {
        throw new ConvexError({
          message: "招待トークンが見つかりません",
          code: "TOKEN_NOT_FOUND",
        });
      }

      // ステータスチェック
      if (inviteToken.status !== "active") {
        throw new ConvexError({
          message: "この招待は既に使用済みまたはキャンセルされています",
          code: "TOKEN_NOT_ACTIVE",
        });
      }

      // 期限チェック
      if (inviteToken.expiresAt < Date.now()) {
        await ctx.db.patch(inviteToken._id, { status: "expired" });
        throw new ConvexError({
          message: "招待の有効期限が切れています",
          code: "TOKEN_EXPIRED",
        });
      }

      // 仮登録ユーザー取得
      const tempUser = await ctx.db.get(inviteToken.tempUserId);
      if (!tempUser || tempUser.isDeleted || tempUser.isActivated) {
        throw new ConvexError({
          message: "仮登録ユーザーが見つかりません",
          code: "TEMP_USER_NOT_FOUND",
        });
      }

      // authIdの重複チェック
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (existingUser) {
        throw new ConvexError({
          message: "このアカウントは既に登録されています",
          code: "AUTH_ID_ALREADY_EXISTS",
        });
      }

      // 仮登録ユーザーにauthId紐付け + isActivated=true
      await ctx.db
        .patch(tempUser._id, {
          authId: args.authId,
          isActivated: true,
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `ユーザーの本登録に失敗しました: ${e}`,
            code: "ACTIVATION_FAILED",
          });
        });

      // トークンstatus=used
      await ctx.db
        .patch(inviteToken._id, {
          status: "used",
          usedAt: Date.now(),
        })
        .catch((e: unknown) => {
          throw new ConvexError({
            message: `トークンの更新に失敗しました: ${e}`,
            code: "TOKEN_UPDATE_FAILED",
          });
        });

      return {
        success: true,
        data: {
          userId: tempUser._id,
          userName: tempUser.name,
          shopId: inviteToken.shopId,
        },
      };
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "本登録処理に失敗しました",
        code: "ACTIVATION_ERROR",
      });
    }
  },
});

// 6. 店舗の招待トークン一覧取得
export const getInviteTokensByShop = query({
  args: { shopId: v.string() },
  handler: async (ctx, args) => {
    try {
      const shopId = args.shopId as Id<"shops">;

      const tokens = await ctx.db
        .query("inviteTokens")
        .withIndex("by_shop", (q) => q.eq("shopId", shopId))
        .collect();

      // 各トークンに仮登録ユーザー情報を付与
      const tokensWithUser = await Promise.all(
        tokens.map(async (token) => {
          const tempUser = await ctx.db.get(token.tempUserId);
          return {
            ...token,
            tempUserName: tempUser?.name,
          };
        }),
      );

      return tokensWithUser;
    } catch {
      return [];
    }
  },
});

// 7. トークンキャンセル
export const cancelInviteToken = mutation({
  args: {
    tokenId: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const tokenId = args.tokenId as Id<"inviteTokens">;

      // トークン取得
      const inviteToken = await ctx.db.get(tokenId);
      if (!inviteToken) {
        throw new ConvexError({
          message: "招待トークンが見つかりません",
          code: "TOKEN_NOT_FOUND",
        });
      }

      // 作成者のauthIdからuserIdを取得
      const creator = await ctx.db
        .query("users")
        .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!creator) {
        throw new ConvexError({
          message: "ユーザーが見つかりません",
          code: "USER_NOT_FOUND",
        });
      }

      // 権限チェック: owner/manager
      const belonging = await ctx.db
        .query("shopUserBelongings")
        .withIndex("by_shop_and_user", (q) => q.eq("shopId", inviteToken.shopId).eq("userId", creator._id))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .first();

      if (!belonging || (belonging.role !== "owner" && belonging.role !== "manager")) {
        throw new ConvexError({
          message: "この操作を行う権限がありません",
          code: "PERMISSION_DENIED",
        });
      }

      // トークンをcancelled化
      await ctx.db.patch(tokenId, { status: "cancelled" }).catch((e: unknown) => {
        throw new ConvexError({
          message: `トークンのキャンセルに失敗しました: ${e}`,
          code: "TOKEN_CANCEL_FAILED",
        });
      });

      return { success: true };
    } catch (e) {
      if (e instanceof ConvexError) {
        throw e;
      }
      throw new ConvexError({
        message: "不正なIDが指定されました",
        code: "INVALID_ID",
      });
    }
  },
});

// 8. ユーザーが仮登録かどうか判定 + 招待情報取得
export const getUserStatus = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      const userId = args.userId as Id<"users">;

      // ユーザー取得
      const user = await ctx.db.get(userId);
      if (!user || user.isDeleted) {
        return null;
      }

      // 仮ユーザーかどうか判定
      const isTempUser = !user.isActivated || !user.authId;

      if (!isTempUser) {
        return {
          user,
          isTempUser: false,
        };
      }

      // 仮ユーザーなら招待トークン情報も返す
      const inviteToken = await ctx.db
        .query("inviteTokens")
        .withIndex("by_temp_user", (q) => q.eq("tempUserId", userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();

      return {
        user,
        isTempUser: true,
        inviteToken: inviteToken
          ? {
              token: inviteToken.token,
              status: inviteToken.status,
              expiresAt: inviteToken.expiresAt,
              createdAt: inviteToken.createdAt,
            }
          : null,
      };
    } catch {
      return null;
    }
  },
});

// 9. 仮ユーザーの招待トークン取得
export const getInviteTokenByTempUser = query({
  args: { tempUserId: v.string() },
  handler: async (ctx, args) => {
    try {
      const tempUserId = args.tempUserId as Id<"users">;

      // tempUserIdから最新のactiveな招待トークンを取得
      const inviteToken = await ctx.db
        .query("inviteTokens")
        .withIndex("by_temp_user", (q) => q.eq("tempUserId", tempUserId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .first();

      if (!inviteToken) {
        return null;
      }

      // 店舗情報も取得
      const shop = await ctx.db.get(inviteToken.shopId);

      return {
        token: inviteToken.token,
        status: inviteToken.status,
        expiresAt: inviteToken.expiresAt,
        createdAt: inviteToken.createdAt,
        shopName: shop?.shopName,
      };
    } catch {
      return null;
    }
  },
});
