/**
 * 招待ドメイン - ポリシー（権限判定ロジック）
 *
 * 責務:
 * - 招待操作の権限判定
 */
import type { ShopUserRoleType } from "../constants";

// 招待を作成・キャンセル・再送できるか
export const canManageInvitation = (role: ShopUserRoleType | null) =>
  role === "owner" || role === "manager";

// 招待一覧を閲覧できるか
export const canViewInvitations = (role: ShopUserRoleType | null) =>
  role === "owner" || role === "manager";
