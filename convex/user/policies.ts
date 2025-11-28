/**
 * ユーザードメイン - ポリシー（権限判定ロジック）
 *
 * 責務:
 * - ユーザー情報の閲覧権限判定
 * - ユーザー操作の権限判定
 */
import type { ShopUserRoleType } from "../constants";

// === 閲覧権限 ===

// 他ユーザーの全情報を閲覧できるか
export const canViewFullUserInfo = (role: ShopUserRoleType | null) =>
  role === "owner" || role === "manager";

// 他ユーザーの所属店舗一覧を閲覧できるか
export const canViewUserShops = (role: ShopUserRoleType | null) =>
  role === "owner" || role === "manager";
