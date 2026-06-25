import { migrations } from "./index";

/**
 * recruitments に shiftStartTime/shiftEndTime を追加したため、
 * 既存の募集ドキュメントに所属店舗の現在値をバックフィルする。
 *
 * 狙い: 店舗設定変更後も、過去の募集の時間軸は作成時点のまま固定される。
 * 既存レコードには「作成時点の値」が残っていないため、移行時点の店舗値を
 * 近似値として採用する（移行以前の履歴はない前提）。
 *
 * NOTE: shiftStartTime/shiftEndTime は m007/m008 完走後に schema から削除済み。
 *   本マイグレーションは実行完了済みの履歴で、runner は完了済みを再実行しないため、
 *   削除済みフィールドへの参照は型ビュー経由で読み書きしてコンパイルのみ通す。
 */
type LegacyShiftTimes = { shiftStartTime?: string; shiftEndTime?: string };

export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (ctx, doc) => {
    const docLegacy = doc as typeof doc & LegacyShiftTimes;
    if (docLegacy.shiftStartTime !== undefined && docLegacy.shiftEndTime !== undefined) return;
    const shop = await ctx.db.get(doc.shopId);
    const shopLegacy = shop as (typeof shop & LegacyShiftTimes) | null;
    if (shopLegacy?.shiftStartTime === undefined || shopLegacy.shiftEndTime === undefined) return;
    const update: LegacyShiftTimes = {
      shiftStartTime: shopLegacy.shiftStartTime,
      shiftEndTime: shopLegacy.shiftEndTime,
    };
    await ctx.db.patch(doc._id, update as Partial<typeof doc>);
  },
});
