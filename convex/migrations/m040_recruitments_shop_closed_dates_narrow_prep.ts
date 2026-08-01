import { migrations } from "./index";

/** shopClosedDates導入前の募集を、現行readerと同じ「休業日なし」へ補完する。 */
export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (_ctx, recruitment) => {
    if (recruitment.shopClosedDates !== undefined) return;
    return { shopClosedDates: [] };
  },
});
