import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

// =============================================================================
// 型定義
// =============================================================================

export type SessionPayload = {
  userId: string;
  isRegistered: boolean;
  roles?: string[];
  exp?: number;
  iat?: number;
};

// =============================================================================
// 定数
// =============================================================================

const SESSION_SECRET = process.env.SESSION_SECRET;
const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7日間

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is not set");
}

const encodedKey = new TextEncoder().encode(SESSION_SECRET);

// =============================================================================
// JWT暗号化・復号化
// =============================================================================

/**
 * JWTペイロードを暗号化
 */
export const encrypt = async (payload: SessionPayload) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
};

/**
 * JWTを復号化してペイロードを取得
 */
export const decrypt = async (session: string | undefined = "") => {
  if (!session) return null;

  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch (error) {
    console.error("Failed to verify session:", error);
    return null;
  }
};

// =============================================================================
// セッション管理（読み取り専用）
// =============================================================================

/**
 * 現在のセッション情報を取得
 */
export const getSession = async () => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;

  if (!sessionCookie) return null;

  return await decrypt(sessionCookie);
};

/**
 * セッションが有効かチェック
 */
export const isValidSession = async () => {
  const session = await getSession();

  if (!session) return false;

  // 有効期限チェック
  if (session.exp && session.exp * 1000 < Date.now()) {
    return false;
  }

  return true;
};

// =============================================================================
// Server Actions（Cookie操作可能）
// =============================================================================

/**
 * 新しいセッションを作成してCookieに保存
 * ⚠️ Server Actionでのみ使用可能
 */
export const createSession = async (payload: SessionPayload) => {
  "use server";

  try {
    const jwt = await encrypt(payload);
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + COOKIE_MAX_AGE),
      sameSite: "lax",
      path: "/",
    });
  } catch (error) {
    console.error("Failed to create session:", error);
    throw new Error("セッションの作成に失敗しました");
  }
};

/**
 * セッションを削除
 * ⚠️ Server Actionでのみ使用可能
 */
export const deleteSession = async () => {
  "use server";

  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch (error) {
    console.error("Failed to delete session:", error);
    throw new Error("セッションの削除に失敗しました");
  }
};

/**
 * JWTをリフレッシュ
 * ⚠️ Server Actionでのみ使用可能
 */
export const refreshJWT = async () => {
  "use server";

  try {
    const session = await getSession();

    if (!session) {
      throw new Error("セッションが存在しません");
    }

    // 新しいJWTを作成（iatを更新）
    const refreshedPayload: SessionPayload = {
      ...session,
      iat: Math.floor(Date.now() / 1000),
    };

    const jwt = await encrypt(refreshedPayload);
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + COOKIE_MAX_AGE),
      sameSite: "lax",
      path: "/",
    });
  } catch (error) {
    console.error("Failed to refresh JWT:", error);
    throw new Error("JWTのリフレッシュに失敗しました");
  }
};

/**
 * 必要に応じてJWTをリフレッシュ（24時間経過時）
 * ⚠️ Server Actionでのみ使用可能
 */
export const refreshJWTIfNeeded = async () => {
  "use server";

  try {
    const session = await getSession();

    if (!session || !session.iat) return;

    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    // 24時間以上経過している場合のみリフレッシュ
    if (session.iat < oneDayAgo) {
      await refreshJWT();
    }
  } catch (error) {
    console.error("Failed to refresh JWT if needed:", error);
    // エラーでも処理は続行（ログのみ）
  }
};

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * セッションから特定の情報を取得
 */
export const getSessionValue = async <K extends keyof SessionPayload>(key: K) => {
  const session = await getSession();
  return session?.[key] ?? null;
};

/**
 * ユーザーが認証済みかチェック
 */
export const isAuthenticated = async () => {
  const session = await getSession();
  return !!session?.userId;
};

/**
 * ユーザーが登録済みかチェック
 */
export const isRegisteredUser = async () => {
  const session = await getSession();
  return !!session?.isRegistered;
};

/**
 * ユーザーIDを取得
 */
export const getCurrentUserId = async () => {
  return await getSessionValue("userId");
};

/**
 * セッション情報を部分更新
 * ⚠️ Server Actionでのみ使用可能
 */
export const updateSession = async (updates: Partial<Omit<SessionPayload, "exp" | "iat">>) => {
  "use server";

  try {
    const session = await getSession();

    if (!session) {
      throw new Error("セッションが存在しません");
    }

    // セッション情報を更新
    const updatedPayload: SessionPayload = {
      ...session,
      ...updates,
      iat: Math.floor(Date.now() / 1000), // 更新時刻も記録
    };

    const jwt = await encrypt(updatedPayload);
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(Date.now() + COOKIE_MAX_AGE),
      sameSite: "lax",
      path: "/",
    });
  } catch (error) {
    console.error("Failed to update session:", error);
    throw new Error("セッション情報の更新に失敗しました");
  }
};
