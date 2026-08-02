import { migrations } from "./index";

/** accessKind導入前のmagic linkを、旧readerと同じ最小権限のsubmitへ補完する。 */
export const migration = migrations.define({
  table: "magicLinks",
  migrateOne: async (_ctx, magicLink) => {
    if (magicLink.accessKind !== undefined) return;
    return { accessKind: "submit" as const };
  },
});
