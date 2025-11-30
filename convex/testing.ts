import { internalMutation } from "./_generated/server";
import { TABLE_NAMES } from "./schema";

/**
 * E2Eテスト用：全テーブルのデータをクリア
 * GitHub Actionsでseed import前に実行
 */
export const clearAllTables = internalMutation(async ({ db }) => {
  for (const tableName of TABLE_NAMES) {
    const docs = await db.query(tableName).collect();
    for (const doc of docs) {
      await db.delete(doc._id);
    }
  }
  return { cleared: TABLE_NAMES };
});
