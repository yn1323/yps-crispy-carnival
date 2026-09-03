import { migrations } from "./index";

type HistoricalNotificationOutbox = { cancelReason?: string };

/** 店舗削除による通知取消理由を、廃止した店舗status語彙から削除事実へ置き換える。 */
export const migration = migrations.define({
  table: "notificationOutbox",
  migrateOne: (_ctx, outbox) => {
    const { cancelReason } = outbox as unknown as HistoricalNotificationOutbox;
    return cancelReason === "shop_inactive" ? { cancelReason: "shop_deleted" as const } : undefined;
  },
});
