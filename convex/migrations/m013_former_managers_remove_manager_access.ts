import { migrations } from "./index";

/**
 * 履歴runnerの連番を維持するための完了済みslot。
 * 現行schemaでは移行途中の管理者statusを保存しないため、処理対象はない。
 */
export const migration = migrations.define({
  table: "organizationMembers",
  migrateOne: async () => undefined,
});
