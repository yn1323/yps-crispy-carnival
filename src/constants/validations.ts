// DB関連の定数はconvex/constants.tsから参照（Single Source of Truth）
export {
  DEFAULT_POSITIONS,
  POSITION_MAX_COUNT,
  POSITION_NAME_MAX_LENGTH,
  type PositionType,
  RECRUITMENT_STATUS,
  type RecruitmentStatusType,
  SHOP_MAX_LENGTH,
  SHOP_MIN_LENGTH,
  SHOP_SUBMIT_FREQUENCY,
  SHOP_TIME_UNIT,
  type ShopSubmitFrequencyType,
  type ShopTimeUnitType,
  SKILL_LEVELS,
  type SkillLevelType,
  STAFF_STATUS,
  type StaffStatusType,
} from "@/convex/constants";

// フロントエンドのみの定数
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 24;

export const USER_MIN_LENGTH = 2;
export const USER_MAX_LENGTH = 20;

// スタッフ関連
export const STAFF_EMAIL_MAX_LENGTH = 255;
