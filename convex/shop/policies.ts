/**
 * 店舗ドメイン - ポリシー（権限判定ロジック）
 *
 * 責務:
 * - ロールベースの権限判定
 * - 操作可否の判定ロジック集約
 * - 情報フィルタリングの判定
 */
import type { ShopUserRoleType } from "../constants";

// === 閲覧権限 ===

// 退職済みユーザーを閲覧できるか
export const canViewResignedUsers = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// 店舗の管理情報（メモ、時給など）を閲覧できるか
export const canViewShopUserInfo = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// 他ユーザーの所属店舗一覧を閲覧できるか
export const canViewOtherUserShops = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// === 操作権限 ===

// 店舗情報を更新できるか
export const canUpdateShop = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// 店舗を削除できるか
export const canDeleteShop = (role: ShopUserRoleType | null) => role === "owner";

// ユーザーを店舗に追加できるか
export const canAddUser = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// ユーザーの役割を変更できるか
export const canUpdateUserRole = (executorRole: ShopUserRoleType | null, targetRole: ShopUserRoleType) => {
  if (!executorRole) return false;
  if (targetRole === "owner") return false; // ownerの役割変更は不可
  return executorRole === "owner" || executorRole === "manager";
};

// ユーザーを退職処理できるか
export const canResignUser = (executorRole: ShopUserRoleType | null, targetRole: ShopUserRoleType) => {
  if (!executorRole) return false;
  if (targetRole === "owner") return false; // ownerは退職不可
  if (executorRole === "manager" && targetRole === "manager") return false; // managerは他managerを退職させられない
  return executorRole === "owner" || executorRole === "manager";
};

// 店舗の管理情報（メモ、時給など）を更新できるか
export const canUpdateShopUserInfo = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// 招待を作成・キャンセル・再送できるか
export const canManageInvitation = (role: ShopUserRoleType | null) => role === "owner" || role === "manager";

// 新規店舗を作成できるか（店舗未所属 OR いずれかの店舗でowner）
export const canCreateShop = (belongings: { role: string }[]) => {
  if (belongings.length === 0) return true;
  return belongings.some((b) => b.role === "owner");
};

// === 許可ロール定数 ===

export const MANAGER_ROLES: ShopUserRoleType[] = ["owner", "manager"];
export const OWNER_ONLY: ShopUserRoleType[] = ["owner"];
