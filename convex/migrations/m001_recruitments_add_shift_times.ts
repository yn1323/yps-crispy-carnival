import { migrations } from "./index";

/**
 * recruitments に shiftStartTime/shiftEndTime を追加したため、
 * 既存の募集ドキュメントに所属店舗の現在値をバックフィルする。
 *
 * 狙い: 店舗設定変更後も、過去の募集の時間軸は作成時点のまま固定される。
 * 既存レコードには「作成時点の値」が残っていないため、移行時点の店舗値を
 * 近似値として採用する（移行以前の履歴はない前提）。
 */
export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (ctx, doc) => {
    // 冪等: 既に両方埋まっていたらスキップ
    if (doc.shiftStartTime !== undefined && doc.shiftEndTime !== undefined) return;
    const shop = await ctx.db.get(doc.shopId);
    if (!shop) return;
    await ctx.db.patch(doc._id, {
      shiftStartTime: shop.shiftStartTime,
      shiftEndTime: shop.shiftEndTime,
    });
  },
});
