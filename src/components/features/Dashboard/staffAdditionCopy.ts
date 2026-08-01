import { SHOP_STAFF_COUNT_MAX } from "@/convex/constants";

export const STAFF_ADDITION_EMAIL_NOTICE =
  "追加後、同意依頼とLINE連携案内をメールで送ります。募集中シフトがある場合は提出リンクも送ります。";

/** スタッフ数が上限に達したときの通知文言（追加・承認で共通） */
export const STAFF_COUNT_LIMIT_TOAST = {
  title: `スタッフは${SHOP_STAFF_COUNT_MAX}人まで登録できます`,
  description: "登録済みのスタッフを削除すると、新しいスタッフを追加できます。",
} as const;
