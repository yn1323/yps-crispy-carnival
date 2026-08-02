import { migrations } from "./index";

/** accessKind導入前のsessionを、旧readerが唯一許可するsubmitへ補完する。 */
export const migration = migrations.define({
  table: "sessions",
  migrateOne: async (_ctx, session) => {
    if (session.accessKind !== undefined) return;
    return { accessKind: "submit" as const };
  },
});
