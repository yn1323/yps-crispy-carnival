import { migrations } from "./index";

/** regularClosedDays導入前の店舗を、現行readerと同じ「定休日なし」へ補完する。 */
export const migration = migrations.define({
  table: "shops",
  migrateOne: async (_ctx, shop) => {
    if (shop.regularClosedDays !== undefined) return;
    return { regularClosedDays: [] };
  },
});
