import { migrations } from "./index";

/**
 * shops の legacy 時間帯フィールド shiftStartTime/shiftEndTime を削除する。
 *
 * submissionPattern への移行（m002）完走後、これらは読み取りに使われなくなった。
 * 本マイグレーションで全ドキュメントから値を unset し、後続 PR の schema narrow
 * （フィールド定義の削除）を安全にする。
 */
export const migration = migrations.define({
  table: "shops",
  migrateOne: async (_ctx, doc) => {
    if (doc.shiftStartTime === undefined && doc.shiftEndTime === undefined) return;
    return { shiftStartTime: undefined, shiftEndTime: undefined };
  },
});
