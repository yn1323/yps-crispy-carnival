import { migrations } from "./index";

/** 履歴runnerの連番を維持するための完了済みslot。 */
export const migration = migrations.define({
  table: "organizationInvitations",
  migrateOne: async () => undefined,
});
