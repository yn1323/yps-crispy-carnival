import { migrations } from "./index";

/** 店舗削除による通知取消理由を、廃止した店舗status語彙から削除事実へ置き換える。 */
export const migration = migrations.define({
  table: "notificationOutbox",
  migrateOne: (_ctx, outbox) =>
    outbox.cancelReason === "shop_inactive" ? { cancelReason: "shop_deleted" as const } : undefined,
});
