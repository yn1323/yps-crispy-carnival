// DB関連の定数定義（Single Source of Truth）
// クライアント側（src/constants/validations.ts）からre-exportされる

export const SHOP_TIME_UNIT = [1, 5, 10, 15, 30, 60] as const;
export type ShopTimeUnitType = (typeof SHOP_TIME_UNIT)[number];

export const SHOP_SUBMIT_FREQUENCY = ["1w", "2w", "1m"] as const;
export type ShopSubmitFrequencyType = (typeof SHOP_SUBMIT_FREQUENCY)[number];

export const SHOP_MIN_LENGTH = 2;
export const SHOP_MAX_LENGTH = 50;

// スタッフステータス定義
export const STAFF_STATUS = ["pending", "active", "resigned"] as const;
export type StaffStatusType = (typeof STAFF_STATUS)[number];

// スキルレベル
export const SKILL_LEVELS = ["未経験", "研修中", "一人前", "ベテラン"] as const;
export type SkillLevelType = (typeof SKILL_LEVELS)[number];

// ポジション（デフォルト値、店舗ごとにカスタム可能）
export const DEFAULT_POSITIONS = ["ホール", "キッチン", "レジ", "その他"] as const;
export type PositionType = (typeof DEFAULT_POSITIONS)[number];

// ポジション制約
export const POSITION_MAX_COUNT = 10;
export const POSITION_NAME_MAX_LENGTH = 20;

// ロール定義
export const STAFF_ROLES = ["owner", "manager", "general"] as const;
export type StaffRoleType = (typeof STAFF_ROLES)[number];

// 招待関連
export const INVITE_EXPIRY_DAYS = 14;
export const INVITE_EXPIRY_MS = INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
