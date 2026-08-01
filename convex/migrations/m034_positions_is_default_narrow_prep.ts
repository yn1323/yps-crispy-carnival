import { migrations } from "./index";

const POSITION_READER_LIMIT = 50;

/**
 * 現行readerが選ぶdefault positionを明示化する。
 *
 * 明示trueがなければactive先頭を選ぶ既存fallbackをそのまま保存し、
 * 複数の明示trueは意味を推測して上書きせずreadinessで止める。
 */
export const migration = migrations.define({
  table: "positions",
  batchSize: 10,
  migrateOne: async (ctx, position) => {
    if (position.isDeleted) {
      if (position.isDefault === undefined) return { isDefault: false };
      return;
    }

    const activePositions = await ctx.db
      .query("positions")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", position.shopId).eq("isDeleted", false))
      .take(POSITION_READER_LIMIT);
    const selected = activePositions.find((candidate) => candidate.isDefault === true) ?? activePositions[0];
    const isSelected = selected?._id === position._id;

    if (isSelected && position.isDefault !== true) return { isDefault: true };
    if (!isSelected && position.isDefault === undefined) return { isDefault: false };
  },
});
