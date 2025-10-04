// DB関連の定数はconvex/constants.tsから参照（Single Source of Truth）
export {
  SHOP_MAX_LENGTH,
  SHOP_MIN_LENGTH,
  SHOP_SUBMIT_FREQUENCY,
  SHOP_TIME_UNIT,
  type ShopSubmitFrequencyType,
  type ShopTimeUnitType,
} from "@/convex/constants";

// フロントエンドのみの定数
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 24;

export const USER_MIN_LENGTH = 2;
export const USER_MAX_LENGTH = 20;
